import {randomUUID} from 'node:crypto'
import path from 'node:path'
import * as z from 'zod/mini'
import type {EnvironmentConfig} from './environment'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'
import {getModelVariants, ModelVariantConfigSchema, ModelVariantSchema, type ModelVariant} from './model'
import {create as createPlan, run as runPlan} from './plan'
import {getScenario, ScenarioSchema, type Scenario} from './scenario'
import {ControlTreatment, TreatmentSchema, TreatmentSetupSchema, type Treatment, type TreatmentSetup} from './treatment'
import {
  getPortableTrialPaths,
  TrialAgentSchema,
  TrialArtifactsSchema,
  WalkthroughSchema,
  type Trial,
  type TrialResult,
} from './trial'
import {TestResultsSchema} from './vitest'

const CapabilityConfigSchema = z.object({
  name: z.string(),
  scenarios: z.array(z.string()),
  setup: z.optional(TreatmentSetupSchema),
})

const BenchmarkConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: ModelVariantConfigSchema,
  setup: z.optional(TreatmentSetupSchema),
  capabilities: z.array(CapabilityConfigSchema),
})

type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>

function defineConfig<const Config extends BenchmarkConfig>(config: Config): Config {
  return config
}

type Capability = {
  name: string
  scenarios: Array<Scenario>
  setup?: TreatmentSetup
}

type Benchmark = {
  id: string
  filepath: string
  name: BenchmarkConfig['name']
  description: BenchmarkConfig['description']
  models: Array<ModelVariant>
  setup?: TreatmentSetup
  capabilities: Array<Capability>
}

type BenchmarkModule = {
  benchmark?: unknown
  default?: unknown
}

const BENCHMARK_FILE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts'])

async function listBenchmarks({
  host = DefaultHost,
  benchmarksDirectory,
  scenariosDirectory,
}: {
  host?: Host
  benchmarksDirectory: string
  scenariosDirectory: string
}): Promise<Array<Benchmark>> {
  if (!host.existsSync(benchmarksDirectory)) {
    throw new Error(`Benchmarks directory does not exist: ${benchmarksDirectory}`)
  }

  const stats = await host.fs.stat(benchmarksDirectory)
  if (!stats.isDirectory()) {
    throw new Error(`Benchmarks path is not a directory: ${benchmarksDirectory}`)
  }

  const filenames = (await host.fs.readdir(benchmarksDirectory)).sort()
  const benchmarks: Array<Benchmark> = []

  for (const filename of filenames) {
    if (!isBenchmarkFile(filename)) {
      continue
    }

    const filepath = path.join(benchmarksDirectory, filename)
    const mod: BenchmarkModule = await host.loadModule(filepath)
    const data = mod.benchmark ?? mod.default
    if (!data) {
      continue
    }

    const parseResult = BenchmarkConfigSchema.safeParse(data)
    if (!parseResult.success) {
      logger.warn(
        `Failed to parse benchmark config for file: ${filepath}. Error: ${z.prettifyError(parseResult.error)}`,
      )
      continue
    }

    const {data: config} = parseResult
    const capabilities = await Promise.all(
      config.capabilities.map(async capability => {
        const scenarios = await Promise.all(
          capability.scenarios.map(scenario => {
            return getScenario(host, scenariosDirectory, scenario)
          }),
        )

        return {
          name: capability.name,
          scenarios,
          setup: capability.setup,
        }
      }),
    )

    benchmarks.push({
      id: getBenchmarkId(filename),
      filepath,
      name: config.name,
      description: config.description,
      models: getModelVariants(config.models),
      setup: config.setup,
      capabilities,
    })
  }

  return benchmarks
}

async function getBenchmark({
  host = DefaultHost,
  benchmarksDirectory,
  scenariosDirectory,
  id,
}: {
  host?: Host
  benchmarksDirectory: string
  scenariosDirectory: string
  id: string
}): Promise<Benchmark> {
  const benchmarks = await listBenchmarks({
    host,
    benchmarksDirectory,
    scenariosDirectory,
  })
  const benchmark = benchmarks.find(candidate => candidate.id === id)
  if (benchmark) {
    return benchmark
  }

  throw new Error(`Benchmark "${id}" was not found in: ${benchmarksDirectory}`)
}

function getBenchmarkId(filename: string): string {
  return path.basename(filename, path.extname(filename))
}

function isBenchmarkFile(filename: string): boolean {
  return !filename.endsWith('.d.ts') && filename !== 'index.ts' && BENCHMARK_FILE_EXTENSIONS.has(path.extname(filename))
}

type BenchmarkTrialResult = TrialResult & {
  capability: Capability
}

type BenchmarkRunResult = Array<BenchmarkTrialResult>

async function run({
  env,
  host = DefaultHost,
  id,
}: {
  env: EnvironmentConfig
  host?: Host
  id: string
}): Promise<BenchmarkRunResult> {
  const benchmark = await getBenchmark({
    host,
    benchmarksDirectory: env.benchmarksDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id,
  })
  const trialCapabilities = new Map<string, Capability>()
  const trials: Array<Trial> = benchmark.models.flatMap(model => {
    return benchmark.capabilities.flatMap(capability => {
      const benchmarkTreatment = createBenchmarkTreatment(benchmark, capability)
      return capability.scenarios.flatMap(scenario => {
        return [ControlTreatment, benchmarkTreatment].map(treatment => {
          const trial = {
            id: randomUUID(),
            scenario,
            treatment,
            model,
          }
          trialCapabilities.set(trial.id, capability)
          return trial
        })
      })
    })
  })
  const plan = await createPlan(trials)
  const results = await runPlan({
    env,
    host,
    plan,
  })

  return results.map(result => {
    const capability = trialCapabilities.get(result.trial.id)
    if (!capability) {
      throw new Error(`Capability was not found for trial: ${result.trial.id}`)
    }

    return {
      ...result,
      capability,
    }
  })
}

function createBenchmarkTreatment(benchmark: Benchmark, capability: Capability): Treatment {
  const setup =
    benchmark.setup || capability.setup
      ? async ({sandbox}: Parameters<TreatmentSetup>[0]) => {
          await benchmark.setup?.({sandbox})
          await capability.setup?.({sandbox})
        }
      : undefined

  return {
    name: 'Benchmark',
    setup,
  }
}

const CapabilityOutputSchema = z.object({
  name: z.string(),
  scenarioIds: z.array(z.string()),
})

const BenchmarkTrialOutputSchema = z.object({
  agent: TrialAgentSchema,
  artifacts: TrialArtifactsSchema,
  capabilityId: z.string(),
  id: z.string(),
  model: ModelVariantSchema,
  scenarioId: z.string(),
  testResults: TestResultsSchema,
  treatmentId: z.string(),
  walkthrough: WalkthroughSchema,
})

const SerializedBenchmarkOutputSchema = z.object({
  benchmarkId: z.string(),
  capabilities: z.record(z.string(), CapabilityOutputSchema),
  scenarios: z.record(
    z.string(),
    z.pick(ScenarioSchema, {
      id: true,
      directory: true,
      prompt: true,
      description: true,
      tags: true,
      testPath: true,
      browserTestPath: true,
    }),
  ),
  treatments: z.record(
    z.string(),
    z.pick(TreatmentSchema, {
      name: true,
    }),
  ),
  trials: z.record(z.string(), BenchmarkTrialOutputSchema),
})

type BenchmarkOutput = {
  benchmarkId: string
  capabilities: Map<string, z.infer<typeof CapabilityOutputSchema>>
  scenarios: Map<string, Scenario>
  treatments: Map<string, {name: string}>
  trials: Map<string, z.infer<typeof BenchmarkTrialOutputSchema>>
}

type BenchmarkOutputOptions = {
  baseDirectory?: string
}

function output(
  benchmarkId: string,
  trialResults: BenchmarkRunResult,
  options: BenchmarkOutputOptions = {},
): BenchmarkOutput {
  const result: BenchmarkOutput = {
    benchmarkId,
    capabilities: new Map(),
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  }

  for (const trialResult of trialResults) {
    const {capability, trial} = trialResult
    const {artifacts, walkthrough} = options.baseDirectory
      ? getPortableTrialPaths(trialResult, options.baseDirectory)
      : trialResult

    if (!result.capabilities.has(capability.name)) {
      result.capabilities.set(capability.name, {
        name: capability.name,
        scenarioIds: capability.scenarios.map(scenario => scenario.id),
      })
    }

    if (!result.scenarios.has(trial.scenario.id)) {
      result.scenarios.set(trial.scenario.id, trial.scenario)
    }

    if (!result.treatments.has(trial.treatment.name)) {
      result.treatments.set(trial.treatment.name, trial.treatment)
    }

    result.trials.set(trial.id, {
      agent: trialResult.agent,
      artifacts,
      capabilityId: capability.name,
      id: trial.id,
      model: trial.model,
      scenarioId: trial.scenario.id,
      testResults: trialResult.testResults,
      treatmentId: trial.treatment.name,
      walkthrough,
    })
  }

  return result
}

function serialize(benchmarkOutput: BenchmarkOutput): string {
  return JSON.stringify({
    benchmarkId: benchmarkOutput.benchmarkId,
    capabilities: Object.fromEntries(benchmarkOutput.capabilities),
    scenarios: Object.fromEntries(benchmarkOutput.scenarios),
    treatments: Object.fromEntries(benchmarkOutput.treatments),
    trials: Object.fromEntries(benchmarkOutput.trials),
  })
}

function deserialize(input: unknown): BenchmarkOutput {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input
  const result = SerializedBenchmarkOutputSchema.parse(parsed, {reportInput: true})

  return {
    benchmarkId: result.benchmarkId,
    capabilities: new Map(Object.entries(result.capabilities)),
    scenarios: new Map(Object.entries(result.scenarios)),
    treatments: new Map(Object.entries(result.treatments)),
    trials: new Map(Object.entries(result.trials)),
  }
}

export {BenchmarkConfigSchema, defineConfig, deserialize, getBenchmark, listBenchmarks, output, run, serialize}
export type {
  BenchmarkConfig,
  Benchmark,
  BenchmarkOutput,
  BenchmarkOutputOptions,
  BenchmarkRunResult,
  BenchmarkTrialResult,
  Capability,
}
