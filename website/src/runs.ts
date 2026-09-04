import fs from 'node:fs/promises'
import {existsSync, type Dirent} from 'node:fs'
import path from 'node:path'

import type {ExperimentOutput} from '@primer/agent-eval/experiment'

const {read} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval/experiment'
)

const RESULTS_DIR = path.resolve(process.cwd(), '..', 'results', 'experiments')

type ExperimentOutputTrial = ExperimentOutput['trials'] extends Map<string, infer Trial> ? Trial : never

type RunOutputResult = {
  id: string
  treatmentId: string
  model: ExperimentOutputTrial['model']['name']
  reasoningEffort: ExperimentOutputTrial['model']['reasoningEffort']
  scenarioId: string
  assistant: {
    logs: ExperimentOutputTrial['agent']['sessions'][number]['messages']
    turns: number
    outputTokens: number
    premiumRequests: number
    totalApiDurationMs: number
    sessionDurationMs: number
    tools: Record<string, number>
  }
  testResults: ExperimentOutputTrial['testResults'] & {
    tests: Array<{
      title: string
      fullName: string
      status: string
      description?: string
    }>
  }
  walkthrough: ExperimentOutputTrial['walkthrough']
}

type RunOutput = {
  experiment: {
    id: string
    models: Array<{
      name: ExperimentOutputTrial['model']['name']
      reasoningEfforts: Array<ExperimentOutputTrial['model']['reasoningEffort']>
    }>
  }
  scenarios: Array<ExperimentOutput['scenarios'] extends Map<string, infer Scenario> ? Scenario : never>
  treatments: Array<{
    id: string
    config: {
      name: string
    }
  }>
  results: Array<RunOutputResult>
}

type Run = {
  id: string
  name: string
  directory: string
  date: Date
  output: RunOutput
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

function isLegacyRunOutput(value: unknown): value is RunOutput {
  const output = asRecord(value)
  const experiment = asRecord(output?.experiment)

  return (
    typeof experiment?.id === 'string' &&
    Array.isArray(experiment.models) &&
    Array.isArray(output?.scenarios) &&
    Array.isArray(output.treatments) &&
    Array.isArray(output.results)
  )
}

async function parseOutput(contents: string, outputFile: string): Promise<RunOutput> {
  const parsed: unknown = JSON.parse(contents)
  const output = asRecord(parsed)

  if (typeof output?.experimentId === 'string') {
    return normalizeOutput(await read(outputFile))
  }

  if (isLegacyRunOutput(parsed)) {
    return parsed
  }

  throw new Error('Result output does not match a supported experiment output format')
}

function isRunName(name: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) {
    return false
  }

  const date = new Date(`${name}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(name)
}

async function listExperimentDirectories(): Promise<Array<Dirent>> {
  try {
    const entries = await fs.readdir(RESULTS_DIR, {withFileTypes: true})
    return entries.filter(entry => {
      return entry.isDirectory()
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function listRunDirectories(experimentId: string): Promise<Array<Dirent>> {
  const experimentDirectory = path.join(RESULTS_DIR, experimentId)
  try {
    const entries = await fs.readdir(experimentDirectory, {withFileTypes: true})
    return entries.filter(entry => {
      return entry.isDirectory() && isRunName(entry.name)
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function listForExperiment(experimentId: string): Promise<Array<Run>> {
  const entries = await listRunDirectories(experimentId)
  const runs = await Promise.all(
    entries.map(entry => {
      return find(experimentId, entry.name)
    }),
  )

  return runs
    .filter((run): run is Run => {
      return run !== null
    })
    .toSorted((a, b) => {
      return b.date.getTime() - a.date.getTime()
    })
}

async function list(): Promise<Array<Run>> {
  const experiments = await listExperimentDirectories()
  const runs = await Promise.all(
    experiments.map(experiment => {
      return listForExperiment(experiment.name)
    }),
  )
  return runs.flat().toSorted((a, b) => {
    return b.date.getTime() - a.date.getTime()
  })
}

async function find(experimentId: string, name: string): Promise<Run | null> {
  if (!isRunName(name)) {
    return null
  }

  const directory = path.join(RESULTS_DIR, experimentId, name)
  if (!existsSync(directory)) {
    return null
  }

  if (!existsSync(path.join(directory, 'output.json'))) {
    return null
  }

  const stats = await fs.stat(directory)
  if (!stats.isDirectory()) {
    return null
  }

  const outputFile = path.join(directory, 'output.json')
  const contents = await fs.readFile(outputFile, 'utf-8')
  const output = await parseOutput(contents, outputFile)
  if (output.experiment.id !== experimentId) {
    return null
  }

  return {
    id: name,
    name,
    directory,
    date: new Date(`${name}T00:00:00.000Z`),
    output,
  }
}

async function get(experimentId: string, name: string): Promise<Run> {
  const run = await find(experimentId, name)
  if (!run) {
    throw new Error(`Run "${name}" for experiment "${experimentId}" was not found in: ${RESULTS_DIR}`)
  }

  return run
}

function normalizeOutput(output: ExperimentOutput): RunOutput {
  const modelReasoningEfforts = new Map<
    ExperimentOutputTrial['model']['name'],
    Set<ExperimentOutputTrial['model']['reasoningEffort']>
  >()

  const results = [...output.trials.values()].map(trial => {
    const reasoningEfforts = modelReasoningEfforts.get(trial.model.name) ?? new Set()
    reasoningEfforts.add(trial.model.reasoningEffort)
    modelReasoningEfforts.set(trial.model.name, reasoningEfforts)

    const tools: Record<string, number> = {}
    for (const session of trial.agent.sessions) {
      for (const [name, count] of Object.entries(session.tools)) {
        tools[name] = (tools[name] ?? 0) + count
      }
    }

    return {
      id: trial.id,
      treatmentId: trial.treatmentId,
      model: trial.model.name,
      reasoningEffort: trial.model.reasoningEffort,
      scenarioId: trial.scenarioId,
      assistant: {
        logs: trial.agent.sessions.flatMap(session => session.messages),
        turns: trial.agent.sessions.reduce((total, session) => total + session.turns, 0),
        outputTokens: trial.agent.sessions.reduce((total, session) => total + session.outputTokens, 0),
        premiumRequests: trial.agent.sessions.reduce((total, session) => total + session.premiumRequests, 0),
        totalApiDurationMs: trial.agent.sessions.reduce((total, session) => total + session.totalApiDurationMs, 0),
        sessionDurationMs: trial.agent.sessions.reduce((total, session) => total + session.sessionDurationMs, 0),
        tools,
      },
      testResults: {
        ...trial.testResults,
        tests: trial.testResults.testResults.flatMap(testResult => {
          return testResult.assertionResults.map(assertion => {
            return {
              title: assertion.title,
              fullName: assertion.fullName,
              status: assertion.status,
              description: assertion.meta.description,
            }
          })
        }),
      },
      walkthrough: trial.walkthrough,
    }
  })

  return {
    experiment: {
      id: output.experimentId,
      models: [...modelReasoningEfforts].map(([name, reasoningEfforts]) => {
        return {
          name,
          reasoningEfforts: [...reasoningEfforts],
        }
      }),
    },
    scenarios: [...output.scenarios.values()],
    treatments: [...output.treatments].map(([id, treatment]) => {
      return {
        id,
        config: {
          name: treatment.name,
        },
      }
    }),
    results,
  }
}

export {list, listForExperiment, get}
export type {Run, RunOutput, RunOutputResult}
