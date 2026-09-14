import path from 'node:path'
import * as z from 'zod/mini'
import type {BenchmarkTrial} from './plan'
import type {RunPlanResult} from '../plan'
import {TrialAgentSchema, TrialArtifactsSchema, TrialJudgesSchema, TrialWalkthroughSchema} from '../trial/run'
import {ScenarioSchema} from '../scenario'
import {TreatmentSchema} from '../treatment'
import type {Benchmark} from './benchmark'
import {ModelVariantSchema} from '../model'
import {DefaultHost, type Host} from '../host'

const BenchmarkTrialOutputSchema = z.object({
  agent: TrialAgentSchema,
  artifacts: TrialArtifactsSchema,
  id: z.string(),
  judges: TrialJudgesSchema,
  model: ModelVariantSchema,
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
      result.scenarios.set(trial.scenario.id, {
        id: trial.scenario.id,
        directory: trial.scenario.directory,
        prompt: trial.scenario.prompt,
        description: trial.scenario.description,
        tags: trial.scenario.tags,
        judges: trial.scenario.judges,
      })
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
      id: trial.id,
      judges: trialResult.judges,
      model: trial.model,
      scenarioId: trial.scenario.id,
      treatmentId: trial.treatment.id,
      walkthrough: trialResult.walkthrough,
    })
  }

  return result
}

type ParseBenchmarkOutputOptions = {}

async function parseBenchmarkOutput(options: ParseBenchmarkOutputOptions): Promise<BenchmarkOutputFile> {
  throw new Error('unimplemented')
}

type WriteBenchmarkOutputOptions = {
  host?: Host
  output: BenchmarkOutput
  outputPath: string
}

async function writeBenchmarkOutput({host = DefaultHost, output, outputPath}: WriteBenchmarkOutputOptions) {
  const outputDirectory = path.dirname(outputPath)
  const trials = new Map<string, string>()

  for (const trial of output.trials.values()) {
    const trialFilePath = path.join(trial.artifacts.directory, `${trial.id}.json`)
    const trialFile: BenchmarkTrialOutput = {
      agent: trial.agent,
      artifacts: trial.artifacts,
      id: trial.id,
      judges: trial.judges,
      model: trial.model,
      scenarioId: trial.scenarioId,
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

export {createBenchmarkOutput, writeBenchmarkOutput}
