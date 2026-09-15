import path from 'node:path'
import * as z from 'zod/mini'
import {DefaultHost, type Host} from '../host'
import {ModelVariantSchema} from '../model'
import type {RunPlanResult} from '../plan'
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
  checks: z._default(TrialChecksSchema, []),
  id: z.string(),
  judges: TrialJudgesSchema,
  model: ModelVariantSchema,
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
  scenarios: z.record(z.string(), ScenarioOutputSchema),
  treatments: z.record(z.string(), TreatmentOutputSchema),
  trials: z.record(z.string(), z.string()),
})

type ExperimentOutputFile = z.infer<typeof ExperimentOutputFileSchema>

type ExperimentOutput = {
  id: string
  scenarios: Map<string, ScenarioOutput>
  treatments: Map<string, TreatmentOutput>
  trials: Map<string, ExperimentTrialOutput>
}

type CreateExperimentOutputOptions = {
  experiment: Experiment
  runPlanResult: RunPlanResult<ExperimentTrial>
}

function createExperimentOutput({experiment, runPlanResult}: CreateExperimentOutputOptions): ExperimentOutput {
  const result: ExperimentOutput = {
    id: experiment.id,
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  }

  for (const {trial, result: trialResult} of runPlanResult.results) {
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
      checks: trialResult.checks,
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
  if (outputs.length === 0) {
    throw new Error('Cannot merge experiment output files: no outputs provided')
  }

  const scenarios = new Map<string, ScenarioOutput>()
  const treatments = new Map<string, TreatmentOutput>()
  const trials = new Map<string, ExperimentTrialOutput>()
  const id = outputs[0].id

  for (const output of outputs) {
    if (id !== output.id) {
      throw new Error(`Cannot merge experiment output files: mismatched experiment IDs (${id} !== ${output.id})`)
    }

    mergeMetadata(scenarios, output.scenarios, 'scenario')
    mergeMetadata(treatments, output.treatments, 'treatment')

    for (const [key, value] of Object.entries(output.trials)) {
      if (trials.has(key)) {
        throw new Error(`Cannot merge experiment output files: duplicate trial ID found: ${key}`)
      }

      const filepath = path.join(outputDirectory, value)
      if (!host.existsSync(filepath)) {
        throw new Error(`Cannot merge experiment output files: trial artifacts file does not exist: ${filepath}`)
      }

      const contents = await host.fs.readFile(filepath, 'utf-8')
      const trialOutput = ExperimentTrialOutputSchema.parse(JSON.parse(contents))
      if (trialOutput.id !== key) {
        throw new Error(`Cannot merge experiment output files: mismatched trial ID for: ${key}`)
      }

      trials.set(key, trialOutput)
    }
  }

  return {id, scenarios, treatments, trials}
}

function mergeMetadata<T>(target: Map<string, T>, source: Record<string, T>, type: string): void {
  for (const [id, value] of Object.entries(source)) {
    if (target.has(id) && JSON.stringify(target.get(id)) !== JSON.stringify(value)) {
      throw new Error(`Cannot merge conflicting ${type} metadata for id: ${id}`)
    }
    target.set(id, value)
  }
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

export {createExperimentOutput, listExperimentOutputFiles, mergeExperimentOutputFiles, writeExperimentOutput}
