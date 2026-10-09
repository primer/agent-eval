import path from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import * as z from 'zod/mini'
import {CopilotRunnerSchema} from '../copilot-runner'
import {CapabilityOutputSchema, type CapabilityOutput} from '../benchmark/output'
import {DefaultHost, type Host} from '../host'
import {ModelVariantSchema} from '../model'
import type {RunPlanResult} from '../plan'
import {resolveTrialArtifactsPath} from '../result-path'
import {ScenarioSchema} from '../scenario/scenario'
import {TreatmentSchema} from '../treatment'
import {
  TrialAgentSchema,
  TrialArtifactsSchema,
  TrialChecksSchema,
  TrialJudgesSchema,
  TrialWalkthroughSchema,
} from '../trial/run'
import type {Experiment} from './experiment'
import type {ExperimentTrial} from './plan'

const ExperimentTrialOutputSchema = z.object({
  agent: TrialAgentSchema,
  artifacts: TrialArtifactsSchema,
  capabilityId: z.optional(z.string()),
  checks: z._default(TrialChecksSchema, []),
  id: z.string(),
  judges: TrialJudgesSchema,
  model: ModelVariantSchema,
  runner: z._default(CopilotRunnerSchema, 'copilot-cli'),
  scenarioId: z.string(),
  treatmentId: z.string(),
  walkthrough: TrialWalkthroughSchema,
})

type ExperimentTrialOutput = z.infer<typeof ExperimentTrialOutputSchema>

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

const ExperimentOutputFileSchema = z.object({
  id: z.string(),
  capabilities: z._default(
    z.record(z.string(), CapabilityOutputSchema).check(ctx => {
      for (const [key, capability] of Object.entries(ctx.value)) {
        if (capability.id !== key) {
          ctx.issues.push({
            code: 'custom',
            message: `Manifest capability ID "${capability.id}" does not match key "${key}"`,
            path: [key, 'id'],
            input: capability.id,
          })
        }
      }
    }),
    {},
  ),
  scenarios: z.record(z.string(), ScenarioOutputSchema).check(ctx => {
    for (const [key, scenario] of Object.entries(ctx.value)) {
      if (scenario.id !== key) {
        ctx.issues.push({
          code: 'custom',
          message: `Manifest scenario ID "${scenario.id}" does not match key "${key}"`,
          path: [key, 'id'],
          input: scenario.id,
        })
      }
    }
  }),
  treatments: z.record(z.string(), TreatmentOutputSchema).check(ctx => {
    for (const [key, treatment] of Object.entries(ctx.value)) {
      if (treatment.id !== key) {
        ctx.issues.push({
          code: 'custom',
          message: `Manifest treatment ID "${treatment.id}" does not match key "${key}"`,
          path: [key, 'id'],
          input: treatment.id,
        })
      }
    }
  }),
  trials: z.record(z.string(), z.string()),
})

type ExperimentOutputFile = z.infer<typeof ExperimentOutputFileSchema>

const ExperimentOutputFilesSchema = z
  .array(ExperimentOutputFileSchema)
  .check(z.minLength(1, 'Cannot merge experiment output files: no outputs provided'), ctx => {
    const id = ctx.value[0]?.id
    const trialIds = new Set<string>()
    const capabilities = new Map<string, CapabilityOutput>()
    const scenarios = new Map<string, ScenarioOutput>()
    const treatments = new Map<string, TreatmentOutput>()

    for (const [index, output] of ctx.value.entries()) {
      if (output.id !== id) {
        ctx.issues.push({
          code: 'custom',
          message: `Cannot merge experiment output files: mismatched experiment IDs (${id} !== ${output.id})`,
          path: [index, 'id'],
          input: output.id,
        })
      }

      for (const [key, capability] of Object.entries(output.capabilities)) {
        if (capabilities.has(key) && !isDeepStrictEqual(capabilities.get(key), capability)) {
          ctx.issues.push({
            code: 'custom',
            message: `Cannot merge conflicting capability metadata for id: ${key}`,
            path: [index, 'capabilities', key],
            input: capability,
          })
        }
        capabilities.set(key, capability)
      }

      for (const [key, scenario] of Object.entries(output.scenarios)) {
        if (scenarios.has(key) && !isDeepStrictEqual(scenarios.get(key), scenario)) {
          ctx.issues.push({
            code: 'custom',
            message: `Cannot merge conflicting scenario metadata for id: ${key}`,
            path: [index, 'scenarios', key],
            input: scenario,
          })
        }
        scenarios.set(key, scenario)
      }

      for (const [key, treatment] of Object.entries(output.treatments)) {
        if (treatments.has(key) && !isDeepStrictEqual(treatments.get(key), treatment)) {
          ctx.issues.push({
            code: 'custom',
            message: `Cannot merge conflicting treatment metadata for id: ${key}`,
            path: [index, 'treatments', key],
            input: treatment,
          })
        }
        treatments.set(key, treatment)
      }

      for (const key of Object.keys(output.trials)) {
        if (trialIds.has(key)) {
          ctx.issues.push({
            code: 'custom',
            message: `Cannot merge experiment output files: duplicate trial ID found: ${key}`,
            path: [index, 'trials', key],
            input: key,
          })
        }
        trialIds.add(key)
      }
    }
  })

type ExperimentOutput = {
  id: string
  capabilities: Map<string, CapabilityOutput>
  scenarios: Map<string, ScenarioOutput>
  treatments: Map<string, TreatmentOutput>
  trials: Map<string, ExperimentTrialOutput>
}

function parseExperimentTrialOutput(
  json: unknown,
  capabilities: ExperimentOutput['capabilities'],
): ExperimentTrialOutput {
  const trial = ExperimentTrialOutputSchema.parse(json)
  if (trial.capabilityId === undefined && capabilities.size === 0) {
    return trial
  }
  const capability = trial.capabilityId === undefined ? undefined : capabilities.get(trial.capabilityId)
  if (!capability || capability.id !== trial.capabilityId || !capability.scenarioIds.includes(trial.scenarioId)) {
    throw new Error(
      `Invalid capability "${trial.capabilityId}" for scenario "${trial.scenarioId}" in trial "${trial.id}"`,
    )
  }
  return trial
}

type CreateExperimentOutputOptions = {
  experiment: Experiment
  runPlanResult: RunPlanResult<ExperimentTrial>
}

function createExperimentOutput({experiment, runPlanResult}: CreateExperimentOutputOptions): ExperimentOutput {
  const result: ExperimentOutput = {
    id: experiment.id,
    capabilities: new Map(),
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  }

  for (const {trial, result: trialResult} of runPlanResult.results) {
    if (experiment.type === 'benchmark' && !('capability' in trial)) {
      throw new Error(`Capability not found for benchmark experiment trial: ${trial.id}`)
    }
    const capability = 'capability' in trial ? trial.capability : undefined
    if (capability && !result.capabilities.has(capability.id)) {
      result.capabilities.set(capability.id, {
        id: capability.id,
        name: capability.name,
        scenarioIds: capability.scenarios.map(scenario => {
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
      ...(capability ? {capabilityId: capability.id} : {}),
      checks: trialResult.checks,
      id: trial.id,
      judges: trialResult.judges,
      model: trial.model,
      runner: trial.runner,
      scenarioId: trial.scenario.id,
      treatmentId: trial.treatment.id,
      walkthrough: trialResult.walkthrough,
    })
  }

  return result
}

type MergeExperimentOutputFilesOptions = {
  host?: Host
  outputs: Array<ExperimentOutputFile>
  outputDirectory: string
}

async function mergeExperimentOutputFiles({
  host = DefaultHost,
  outputs,
  outputDirectory,
}: MergeExperimentOutputFilesOptions): Promise<ExperimentOutput> {
  const files = ExperimentOutputFilesSchema.parse(outputs)
  const capabilities = new Map<string, CapabilityOutput>()
  const scenarios = new Map<string, ScenarioOutput>()
  const treatments = new Map<string, TreatmentOutput>()
  const trials = new Map<string, ExperimentTrialOutput>()
  const id = files[0].id

  for (const output of files) {
    for (const [key, value] of Object.entries(output.capabilities)) {
      capabilities.set(key, value)
    }
    for (const [key, value] of Object.entries(output.scenarios)) {
      scenarios.set(key, value)
    }
    for (const [key, value] of Object.entries(output.treatments)) {
      treatments.set(key, value)
    }

    for (const [key, value] of Object.entries(output.trials)) {
      const filepath = await resolveTrialArtifactsPath(host, outputDirectory, value)

      const contents = await host.fs.readFile(filepath, 'utf-8')
      const trialOutput = parseExperimentTrialOutput(JSON.parse(contents), new Map(Object.entries(output.capabilities)))
      if (trialOutput.id !== key) {
        throw new Error(`Cannot merge experiment output files: mismatched trial ID for: ${key}`)
      }

      trials.set(key, trialOutput)
    }
  }

  return {id, capabilities, scenarios, treatments, trials}
}

type WriteExperimentOutputOptions = {
  host?: Host
  output: ExperimentOutput
  outputPath: string
}

async function writeExperimentOutput({host = DefaultHost, output, outputPath}: WriteExperimentOutputOptions) {
  const outputDirectory = path.dirname(outputPath)
  const trials = new Map<string, string>()

  await host.fs.mkdir(outputDirectory, {recursive: true})

  for (const trial of output.trials.values()) {
    const trialFilePath = path.join(trial.artifacts.directory, `${trial.id}.json`)
    await host.fs.mkdir(path.dirname(trialFilePath), {recursive: true})
    await host.fs.writeFile(trialFilePath, JSON.stringify(trial, null, 2), 'utf-8')
    trials.set(trial.id, path.relative(outputDirectory, trialFilePath))
  }

  const experimentFile: ExperimentOutputFile = {
    id: output.id,
    capabilities: Object.fromEntries(output.capabilities),
    scenarios: Object.fromEntries(output.scenarios),
    treatments: Object.fromEntries(output.treatments),
    trials: Object.fromEntries(trials),
  }

  await host.fs.writeFile(outputPath, JSON.stringify(experimentFile, null, 2), 'utf-8')
}

type ListExperimentOutputFilesOptions = {
  host?: Host
  outputDirectory: string
}

const OUTPUT_FILE_NAME_PATTERN = /^output-[0-9]+\.json$/

async function listExperimentOutputFiles({
  host = DefaultHost,
  outputDirectory,
}: ListExperimentOutputFilesOptions): Promise<Array<[output: ExperimentOutputFile, filepath: string]>> {
  const entries = await host.fs.readdir(outputDirectory, {
    withFileTypes: true,
  })
  const outputFiles: Array<[output: ExperimentOutputFile, filepath: string]> = []

  for (const entry of entries) {
    if (!entry.isFile() || !OUTPUT_FILE_NAME_PATTERN.test(entry.name)) {
      continue
    }

    const filepath = path.join(outputDirectory, entry.name)
    const contents = await host.fs.readFile(filepath, 'utf-8')
    const outputFile = ExperimentOutputFileSchema.parse(JSON.parse(contents))
    outputFiles.push([outputFile, filepath])
  }

  return outputFiles
}

export {
  ExperimentOutputFileSchema,
  ExperimentTrialOutputSchema,
  parseExperimentTrialOutput,
  createExperimentOutput,
  listExperimentOutputFiles,
  mergeExperimentOutputFiles,
  writeExperimentOutput,
}
export type {ExperimentOutput, ExperimentTrialOutput}
