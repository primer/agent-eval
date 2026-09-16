import path from 'node:path'
import * as z from 'zod/mini'
import {CopilotRunnerSchema} from '../copilot-runner'
import type {BenchmarkTrial} from './plan'
import type {RunPlanResult} from '../plan'
import {
  TrialAgentSchema,
  TrialArtifactsSchema,
  TrialChecksSchema,
  TrialJudgesSchema,
  TrialWalkthroughSchema,
} from '../trial/run'
import {ScenarioSchema} from '../scenario/scenario'
import {TreatmentSchema} from '../treatment'
import type {Benchmark} from './benchmark'
import {ModelVariantSchema} from '../model'
import {DefaultHost, type Host} from '../host'
import {resolveTrialArtifactsPath} from '../result-path'

const BenchmarkTrialOutputSchema = z.object({
  agent: TrialAgentSchema,
  artifacts: TrialArtifactsSchema,
  capabilityId: z.string(),
  checks: z._default(TrialChecksSchema, []),
  id: z.string(),
  judges: TrialJudgesSchema,
  model: ModelVariantSchema,
  runner: z.optional(CopilotRunnerSchema),
  scenarioId: z.string(),
  treatmentId: z.string(),
  walkthrough: TrialWalkthroughSchema,
})

type BenchmarkTrialOutput = z.infer<typeof BenchmarkTrialOutputSchema>

const CapabilityOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  scenarioIds: z.array(z.string()),
})

type CapabilityOutput = z.infer<typeof CapabilityOutputSchema>

const ScenarioOutputSchema = z.pick(ScenarioSchema, {
  id: true,
  directory: true,
  prompt: true,
  description: true,
  tags: true,
  judges: true,
  image: true,
})

type ScenarioOutput = z.infer<typeof ScenarioOutputSchema>

const TreatmentOutputSchema = z.pick(TreatmentSchema, {
  id: true,
  name: true,
})

type TreatmentOutput = z.infer<typeof TreatmentOutputSchema>

const BenchmarkOutputFileSchema = z.object({
  id: z.string(),
  capabilities: z.record(z.string(), CapabilityOutputSchema),
  scenarios: z.record(z.string(), ScenarioOutputSchema),
  treatments: z.record(z.string(), TreatmentOutputSchema),
  trials: z.record(z.string(), z.string()),
})

type BenchmarkOutputFile = z.infer<typeof BenchmarkOutputFileSchema>

type BenchmarkOutput = {
  id: string
  capabilities: Map<string, CapabilityOutput>
  scenarios: Map<string, ScenarioOutput>
  treatments: Map<string, TreatmentOutput>
  trials: Map<string, BenchmarkTrialOutput>
}

function parseBenchmarkTrialOutput(json: unknown, capabilities: BenchmarkOutput['capabilities']): BenchmarkTrialOutput {
  const trial = BenchmarkTrialOutputSchema.parse(json)
  const {capabilityId} = trial
  const capability = capabilities.get(capabilityId)
  if (!capability || capability.id !== capabilityId || !capability.scenarioIds.includes(trial.scenarioId)) {
    throw new Error(`Invalid capability "${capabilityId}" for scenario "${trial.scenarioId}" in trial "${trial.id}"`)
  }
  return trial
}

type CreateBenchmarkOutputOptions = {
  benchmark: Benchmark
  runPlanResult: RunPlanResult<BenchmarkTrial>
}

function createBenchmarkOutput({benchmark, runPlanResult}: CreateBenchmarkOutputOptions): BenchmarkOutput {
  const result: BenchmarkOutput = {
    id: benchmark.id,
    capabilities: new Map(),
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  }

  for (const {trial, result: trialResult} of runPlanResult.results) {
    if (!result.capabilities.has(trial.capability.id)) {
      result.capabilities.set(trial.capability.id, {
        id: trial.capability.id,
        name: trial.capability.name,
        scenarioIds: trial.capability.scenarios.map(scenario => {
          return scenario.id
        }),
      })
    }

    if (!result.scenarios.has(trial.scenario.id)) {
      result.scenarios.set(trial.scenario.id, ScenarioOutputSchema.parse(trial.scenario))
    }

    if (!result.treatments.has(trial.treatment.id)) {
      result.treatments.set(trial.treatment.id, {
        id: trial.treatment.id,
        name: trial.treatment.name,
      })
    }

    result.trials.set(trial.id, {
      agent: trialResult.agent,
      artifacts: trialResult.artifacts,
      capabilityId: trial.capability.id,
      checks: trialResult.checks,
      id: trial.id,
      judges: trialResult.judges,
      model: trial.model,
      runner: trial.runner ?? 'copilot-cli',
      scenarioId: trial.scenario.id,
      treatmentId: trial.treatment.id,
      walkthrough: trialResult.walkthrough,
    })
  }

  return result
}

type MergeBenchmarkOutputFilesOptions = {
  host?: Host
  outputs: Array<BenchmarkOutputFile>
  outputDirectory: string
}

async function mergeBenchmarkOutputFiles({
  host = DefaultHost,
  outputs,
  outputDirectory,
}: MergeBenchmarkOutputFilesOptions): Promise<BenchmarkOutput> {
  if (outputs.length === 0) {
    throw new Error('Cannot merge benchmark output files: no outputs provided')
  }

  const capabilities = new Map<string, CapabilityOutput>()
  const scenarios = new Map<string, ScenarioOutput>()
  const treatments = new Map<string, TreatmentOutput>()
  const trials = new Map<string, BenchmarkTrialOutput>()
  const id = outputs[0].id

  for (const output of outputs) {
    if (id !== output.id) {
      throw new Error(`Cannot merge benchmark output files: mismatched benchmark IDs (${id} !== ${output.id})`)
    }

    for (const [key, value] of Object.entries(output.capabilities)) {
      if (!capabilities.has(key)) {
        capabilities.set(key, value)
      }
    }

    for (const [key, value] of Object.entries(output.scenarios)) {
      if (!scenarios.has(key)) {
        scenarios.set(key, value)
      }
    }

    for (const [key, value] of Object.entries(output.treatments)) {
      if (!treatments.has(key)) {
        treatments.set(key, value)
      }
    }

    for (const [key, value] of Object.entries(output.trials)) {
      if (trials.has(key)) {
        throw new Error(`Cannot merge benchmark output files: duplicate trial ID found: ${key}`)
      }

      const filepath = await resolveTrialArtifactsPath(host, outputDirectory, value)

      const contents = await host.fs.readFile(filepath, 'utf-8')
      const trialOutput = parseBenchmarkTrialOutput(JSON.parse(contents), new Map(Object.entries(output.capabilities)))
      if (trialOutput.id !== key) {
        throw new Error(`Cannot merge benchmark output files: mismatched trial ID for: ${key}`)
      }

      trials.set(key, trialOutput)
    }
  }

  const output: BenchmarkOutput = {
    id,
    capabilities,
    scenarios,
    treatments,
    trials,
  }

  return output
}

type WriteBenchmarkOutputOptions = {
  host?: Host
  output: BenchmarkOutput
  outputPath: string
}

async function writeBenchmarkOutput({host = DefaultHost, output, outputPath}: WriteBenchmarkOutputOptions) {
  const outputDirectory = path.dirname(outputPath)
  const trials = new Map<string, string>()
  await host.fs.mkdir(outputDirectory, {recursive: true})

  for (const trial of output.trials.values()) {
    const trialFilePath = path.join(trial.artifacts.directory, `${trial.id}.json`)
    const trialFile: BenchmarkTrialOutput = {
      agent: trial.agent,
      artifacts: trial.artifacts,
      capabilityId: trial.capabilityId,
      checks: trial.checks,
      id: trial.id,
      judges: trial.judges,
      model: trial.model,
      scenarioId: trial.scenarioId,
      runner: trial.runner ?? 'copilot-cli',
      treatmentId: trial.treatmentId,
      walkthrough: trial.walkthrough,
    }

    await host.fs.writeFile(trialFilePath, JSON.stringify(trialFile, null, 2), 'utf-8')

    trials.set(trial.id, path.relative(outputDirectory, trialFilePath))
  }

  const benchmarkFile: BenchmarkOutputFile = {
    id: output.id,
    capabilities: Object.fromEntries(output.capabilities),
    scenarios: Object.fromEntries(output.scenarios),
    treatments: Object.fromEntries(output.treatments),
    trials: Object.fromEntries(trials),
  }

  await host.fs.writeFile(outputPath, JSON.stringify(benchmarkFile, null, 2), 'utf-8')
}

type ListBenchmarkOutputFilesOptions = {
  host?: Host
  outputDirectory: string
}

const OUTPUT_FILE_NAME_PATTERN = /^output-[0-9]+$/

async function listBenchmarkOutputFiles({
  host = DefaultHost,
  outputDirectory,
}: ListBenchmarkOutputFilesOptions): Promise<Array<[output: BenchmarkOutputFile, filepath: string]>> {
  const entries = await host.fs.readdir(outputDirectory, {
    withFileTypes: true,
  })
  const outputFiles: Array<[output: BenchmarkOutputFile, filepath: string]> = []

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    if (path.extname(entry.name) !== '.json') {
      continue
    }

    if (!OUTPUT_FILE_NAME_PATTERN.test(path.basename(entry.name, '.json'))) {
      continue
    }

    const filepath = path.join(outputDirectory, entry.name)
    const contents = await host.fs.readFile(filepath, 'utf-8')
    const outputFile = BenchmarkOutputFileSchema.parse(JSON.parse(contents))
    outputFiles.push([outputFile, filepath])
  }

  return outputFiles
}

export {
  BenchmarkOutputFileSchema,
  BenchmarkTrialOutputSchema,
  parseBenchmarkTrialOutput,
  createBenchmarkOutput,
  listBenchmarkOutputFiles,
  mergeBenchmarkOutputFiles,
  writeBenchmarkOutput,
}
export type {BenchmarkOutput, BenchmarkTrialOutput}
