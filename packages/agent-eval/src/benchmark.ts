import {randomUUID} from 'node:crypto'
import path from 'node:path'
import * as z from 'zod/mini'
import type {EnvironmentConfig} from './environment'
import {DefaultHost, type Host} from './host'
import {logger} from './logger'
import {getModelVariants, ModelVariantConfigSchema, ModelVariantSchema, type ModelVariant} from './model'
import {
  create as createDurablePlan,
  run as runPlan,
  type BenchmarkPlan,
  type BenchmarkPlanTrialReference,
  type RuntimePlan,
} from './plan'
import {getScenario, ScenarioSchema, type Scenario} from './scenario'
import {ControlTreatment, TreatmentSchema, TreatmentSetupSchema, type Treatment, type TreatmentSetup} from './treatment'
import {RubricResultSchema} from './rubric'
import {
  getPortableTrialPaths,
  readTrialFiles,
  TrialAgentSchema,
  TrialArtifactsSchema,
  WalkthroughSchema,
  writeTrialFiles,
  type ResultFileOptions,
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

function createPlan(benchmark: Benchmark): BenchmarkPlan {
  const capabilityIds = new Set<string>()

  for (const capability of benchmark.capabilities) {
    if (capabilityIds.has(capability.name)) {
      throw new Error(`Benchmark "${benchmark.id}" contains duplicate capability id: ${capability.name}`)
    }

    capabilityIds.add(capability.name)
  }

  const trials: Array<BenchmarkPlanTrialReference> = benchmark.models.flatMap(model => {
    return benchmark.capabilities.flatMap(capability => {
      return capability.scenarios.flatMap(scenario => {
        return [ControlTreatment.name, 'Benchmark'].map(treatmentId => {
          return {
            id: randomUUID(),
            scenarioId: scenario.id,
            treatmentId,
            model,
            capabilityId: capability.name,
          }
        })
      })
    })
  })

  return createDurablePlan({
    source: {
      kind: 'benchmark',
      id: benchmark.id,
    },
    trials,
  })
}

function resolvePlan(
  benchmark: Benchmark,
  plan: BenchmarkPlan,
): {
  plan: RuntimePlan
  trialCapabilities: Map<string, Capability>
} {
  if (plan.source.kind !== 'benchmark') {
    throw new Error(`Expected a benchmark plan, received: ${plan.source.kind}`)
  }

  if (plan.source.id !== benchmark.id) {
    throw new Error(`Plan references benchmark "${plan.source.id}", but loaded benchmark "${benchmark.id}"`)
  }

  const capabilities = new Map<string, Capability>()
  for (const capability of benchmark.capabilities) {
    if (capabilities.has(capability.name)) {
      throw new Error(`Benchmark "${benchmark.id}" contains duplicate capability id: ${capability.name}`)
    }

    capabilities.set(capability.name, capability)
  }
  const trialCapabilities = new Map<string, Capability>()
  const trials: Array<Trial> = plan.trials.map(reference => {
    const capability = capabilities.get(reference.capabilityId)
    if (!capability) {
      throw new Error(`Plan trial "${reference.id}" references missing benchmark capability: ${reference.capabilityId}`)
    }

    const scenario = capability.scenarios.find(candidate => candidate.id === reference.scenarioId)
    if (!scenario) {
      throw new Error(
        `Plan trial "${reference.id}" references scenario "${reference.scenarioId}" outside capability "${reference.capabilityId}"`,
      )
    }

    const model = benchmark.models.find(candidate => {
      return candidate.name === reference.model.name && candidate.reasoningEffort === reference.model.reasoningEffort
    })
    if (!model) {
      throw new Error(
        `Plan trial "${reference.id}" references missing model variant: ${reference.model.name}/${reference.model.reasoningEffort}`,
      )
    }

    let treatment
    if (reference.treatmentId === ControlTreatment.name) {
      treatment = ControlTreatment
    } else if (reference.treatmentId === 'Benchmark') {
      treatment = createBenchmarkTreatment(benchmark, capability)
    } else {
      throw new Error(`Plan trial "${reference.id}" references missing benchmark treatment: ${reference.treatmentId}`)
    }

    trialCapabilities.set(reference.id, capability)
    return {
      id: reference.id,
      scenario,
      treatment,
      model,
    }
  })

  return {
    plan: {
      trials,
    },
    trialCapabilities,
  }
}

async function run({
  env,
  host = DefaultHost,
  id,
  plan,
}: {
  env: EnvironmentConfig
  host?: Host
  id?: string
  plan?: BenchmarkPlan
}): Promise<BenchmarkRunResult> {
  if (id && plan) {
    throw new Error('Benchmark run accepts either an id or a plan, not both')
  }

  if (!id && !plan) {
    throw new Error('Benchmark run requires an id or a plan')
  }

  const benchmarkId = plan?.source.id ?? id
  if (!benchmarkId) {
    throw new Error('Benchmark run requires an id or a plan')
  }

  const benchmark = await getBenchmark({
    host,
    benchmarksDirectory: env.benchmarksDirectory,
    scenariosDirectory: env.scenariosDirectory,
    id: benchmarkId,
  })
  const resolved = resolvePlan(benchmark, plan ?? createPlan(benchmark))
  const results = await runPlan({
    env,
    host,
    plan: resolved.plan,
  })

  return results.map(result => {
    const capability = resolved.trialCapabilities.get(result.trial.id)
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
  let setup = benchmark.setup ?? capability.setup
  if (benchmark.setup && capability.setup) {
    setup = async ({sandbox}: Parameters<TreatmentSetup>[0]) => {
      await benchmark.setup?.({sandbox})
      await capability.setup?.({sandbox})
    }
  }

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
  rubricResult: z.optional(RubricResultSchema),
})

const BenchmarkOutputFileSchema = z.object({
  benchmarkId: z.string(),
  capabilities: z.record(z.string(), CapabilityOutputSchema),
  scenarios: z.record(
    z.string(),
    z.pick(ScenarioSchema, {
      id: true,
      directory: true,
      prompt: true,
      description: true,
      rubric: true,
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
  trials: z.record(z.string(), z.string()),
})

type BenchmarkOutputFile = z.infer<typeof BenchmarkOutputFileSchema>

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

    const outputTrial: z.infer<typeof BenchmarkTrialOutputSchema> = {
      agent: trialResult.agent,
      artifacts,
      capabilityId: capability.name,
      id: trial.id,
      model: trial.model,
      scenarioId: trial.scenario.id,
      testResults: trialResult.testResults,
      treatmentId: trial.treatment.name,
      walkthrough,
    }
    if (trialResult.rubricResult) {
      outputTrial.rubricResult = trialResult.rubricResult
    }
    result.trials.set(trial.id, outputTrial)
  }

  return result
}

async function write(
  filepath: string,
  benchmarkOutput: BenchmarkOutput,
  options: ResultFileOptions = {},
): Promise<void> {
  const host = options.host ?? DefaultHost
  const trials = await writeTrialFiles(filepath, benchmarkOutput.trials, options)
  await host.fs.writeFile(
    filepath,
    JSON.stringify({
      benchmarkId: benchmarkOutput.benchmarkId,
      capabilities: Object.fromEntries(benchmarkOutput.capabilities),
      scenarios: Object.fromEntries(benchmarkOutput.scenarios),
      treatments: Object.fromEntries(benchmarkOutput.treatments),
      trials,
    }),
    'utf-8',
  )
}

async function read(filepath: string, options: ResultFileOptions = {}): Promise<BenchmarkOutput> {
  const host = options.host ?? DefaultHost
  const contents = await host.fs.readFile(filepath, 'utf-8')
  const result = BenchmarkOutputFileSchema.parse(JSON.parse(contents), {reportInput: true})

  return {
    benchmarkId: result.benchmarkId,
    capabilities: new Map(Object.entries(result.capabilities)),
    scenarios: new Map(Object.entries(result.scenarios)),
    treatments: new Map(Object.entries(result.treatments)),
    trials: await readTrialFiles(
      filepath,
      result.trials,
      input => {
        return BenchmarkTrialOutputSchema.parse(input, {reportInput: true})
      },
      options,
    ),
  }
}

function parseOutputFile(input: unknown): BenchmarkOutputFile {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input
  return BenchmarkOutputFileSchema.parse(parsed, {reportInput: true})
}

function merge(outputs: Array<BenchmarkOutput>): BenchmarkOutput {
  const [first, ...remaining] = outputs
  if (!first) {
    throw new Error('At least one benchmark output is required to merge shards')
  }

  const result: BenchmarkOutput = {
    benchmarkId: first.benchmarkId,
    capabilities: new Map(first.capabilities),
    scenarios: new Map(first.scenarios),
    treatments: new Map(first.treatments),
    trials: new Map(first.trials),
  }

  for (const shardOutput of remaining) {
    if (shardOutput.benchmarkId !== result.benchmarkId) {
      throw new Error(
        `Cannot merge benchmark outputs for different sources: "${result.benchmarkId}" and "${shardOutput.benchmarkId}"`,
      )
    }

    mergeMetadataMap(result.capabilities, shardOutput.capabilities, 'capability')
    mergeMetadataMap(result.scenarios, shardOutput.scenarios, 'scenario')
    mergeMetadataMap(result.treatments, shardOutput.treatments, 'treatment')

    for (const [trialId, trial] of shardOutput.trials) {
      if (result.trials.has(trialId)) {
        throw new Error(`Cannot merge duplicate trial id: ${trialId}`)
      }

      result.trials.set(trialId, trial)
    }
  }

  return result
}

function mergeMetadataMap<T>(target: Map<string, T>, source: Map<string, T>, type: string): void {
  for (const [id, value] of source) {
    const existing = target.get(id)
    if (target.has(id) && JSON.stringify(existing) !== JSON.stringify(value)) {
      throw new Error(`Cannot merge conflicting ${type} metadata for id: ${id}`)
    }

    target.set(id, value)
  }
}

export {
  BenchmarkConfigSchema,
  createPlan,
  defineConfig,
  getBenchmark,
  listBenchmarks,
  merge,
  output,
  parseOutputFile,
  read,
  resolvePlan,
  run,
  write,
}
export type {
  BenchmarkConfig,
  Benchmark,
  BenchmarkOutput,
  BenchmarkOutputFile,
  BenchmarkOutputOptions,
  BenchmarkRunResult,
  BenchmarkTrialResult,
  Capability,
  ResultFileOptions,
}
