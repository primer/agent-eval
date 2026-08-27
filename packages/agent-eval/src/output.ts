import * as z from 'zod/mini'
import {MessageSchema, type Message} from './copilot-cli'
import type {ExperimentConfig, ExperimentScenarioConfig} from './experiment-config'
import {models} from './model'
import type {Model, ReasoningEffort} from './model'
import type {ResolvedScenario} from './resolve-experiment-scenario'
import type {TreatmentResult, Walkthrough} from './treatment'

type AgentEvalOutputResult = {
  id: string
  treatmentId: string
  model: Model
  reasoningEffort?: ReasoningEffort
  scenarioId: string
  artifacts: {
    copilotConfigPath: string
    directory: string
    skillsConfigPath: string
    testResultsPath: string
    workspacePath: string
  }
  assistant: {
    logs: Array<Message>
    turns: number
    outputTokens: number
    premiumRequests: number
    totalNanoAiu?: number
    totalApiDurationMs: number
    sessionDurationMs: number
    tools: Record<string, number>
  }
  testResults: {
    numTotalTests: number
    numPassedTests: number
    numFailedTests: number
    numPendingTests: number
    numTodoTests: number
    tests: Array<{
      title: string
      fullName: string
      status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled'
      description?: string
    }>
  }
  walkthrough: Walkthrough
}

type AgentEvalOutput = {
  id: string
  experiment: {
    id: string
    name: string
    description: string
    models: Array<{
      name: Model
      reasoningEfforts: Array<ReasoningEffort>
    }>
    scenarios: Array<ExperimentScenarioConfig>
  }
  scenarios: Array<ResolvedScenario>
  treatments: Array<{
    id: string
    config: {
      name: string
    }
  }>
  results: Array<AgentEvalOutputResult>
}

const modelNames = new Set<string>(models.map(model => model.name))
const reasoningEfforts = new Set<string>(models.flatMap(model => model.reasoningEfforts))
const ModelSchema = z.custom<Model, string>(
  value => typeof value === 'string' && modelNames.has(value),
  'Expected a supported model',
)
const ReasoningEffortSchema = z.custom<ReasoningEffort, string>(
  value => typeof value === 'string' && reasoningEfforts.has(value),
  'Expected a supported reasoning effort',
)

const ExperimentScenarioSchema = z.union([
  z.string(),
  z.object({
    name: z.optional(z.string()),
    path: z.string(),
  }),
])

const TreatmentConfigSchema = z.object({
  name: z.string(),
})

const ExperimentModelConfigSchema = z.object({
  name: ModelSchema,
  reasoningEfforts: z.array(ReasoningEffortSchema),
})

const AgentEvalOutputExperimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  models: z.array(ExperimentModelConfigSchema),
  scenarios: z.array(ExperimentScenarioSchema),
})

const ResolvedScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  config: z.object({
    description: z.optional(z.string()),
    prompt: z.string(),
  }),
  testPath: z.string(),
  browserTestPath: z.optional(z.string()),
})

const unavailableWalkthrough = {type: 'Unavailable'} as const

const AgentEvalOutputResultSchema = z.object({
  id: z.string(),
  treatmentId: z.string(),
  model: ModelSchema,
  reasoningEffort: z.optional(ReasoningEffortSchema),
  scenarioId: z.string(),
  artifacts: z.object({
    copilotConfigPath: z.string(),
    directory: z.string(),
    skillsConfigPath: z.string(),
    testResultsPath: z.string(),
    workspacePath: z.string(),
  }),
  assistant: z.object({
    logs: z.array(MessageSchema),
    turns: z.number(),
    outputTokens: z.number(),
    premiumRequests: z.number(),
    // Runs created before totalNanoAiu was supported do not include this field
    totalNanoAiu: z.optional(z.number()),
    totalApiDurationMs: z.number(),
    sessionDurationMs: z.number(),
    tools: z.record(z.string(), z.number()),
  }),
  testResults: z.object({
    numTotalTests: z.number(),
    numPassedTests: z.number(),
    numFailedTests: z.number(),
    numPendingTests: z.number(),
    numTodoTests: z.number(),
    tests: z.array(
      z.object({
        title: z.string(),
        fullName: z.string(),
        status: z.enum(['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled']),
        description: z.optional(z.string()),
      }),
    ),
  }),
  // Runs created before walkthroughs were supported do not include this field
  walkthrough: z.pipe(
    z.optional(
      z.discriminatedUnion('type', [
        z.object({type: z.literal('Unavailable')}),
        z.object({type: z.literal('Screenshot'), filepath: z.string()}),
        z.object({type: z.literal('Screenshots'), screenshots: z.array(z.string())}),
        z.object({type: z.literal('Video'), filepath: z.string()}),
      ]),
    ),
    z.transform(value => value ?? unavailableWalkthrough),
  ),
})

const AgentEvalOutputSchema = z.object({
  id: z.string(),
  experiment: AgentEvalOutputExperimentSchema,
  scenarios: z.array(ResolvedScenarioSchema),
  treatments: z.array(
    z.object({
      id: z.string(),
      config: TreatmentConfigSchema,
    }),
  ),
  results: z.array(AgentEvalOutputResultSchema),
})

type CreateAgentEvalOutputOptions = {
  id: string
  experimentId: string
  experiment: ExperimentConfig
  scenarios: Array<ResolvedScenario>
  results: Array<TreatmentResult>
}

function createAgentEvalOutput({
  id,
  experimentId,
  experiment,
  scenarios,
  results,
}: CreateAgentEvalOutputOptions): AgentEvalOutput {
  const treatmentsByName = new Map<
    string,
    {
      id: string
      config: {
        name: string
      }
    }
  >()

  for (const result of results) {
    if (!treatmentsByName.has(result.treatment.config.name)) {
      treatmentsByName.set(result.treatment.config.name, {
        id: result.treatment.id,
        config: {
          name: result.treatment.config.name,
        },
      })
    }
  }

  return {
    id,
    experiment: {
      id: experimentId,
      name: experiment.name,
      description: experiment.description,
      models: experiment.models,
      scenarios: experiment.scenarios,
    },
    scenarios,
    treatments: [...treatmentsByName.values()],
    results: results.map(result => {
      const treatment = treatmentsByName.get(result.treatment.config.name)
      if (!treatment) {
        throw new Error(`Treatment "${result.treatment.config.name}" was not normalized`)
      }

      return {
        id: result.id,
        treatmentId: treatment.id,
        model: result.treatment.model,
        reasoningEffort: result.treatment.reasoningEffort,
        scenarioId: result.treatment.scenario.id,
        artifacts: result.artifacts,
        assistant: result.assistant,
        testResults: result.testResults,
        walkthrough: result.walkthrough,
      }
    }),
  }
}

function parseAgentEvalOutput(value: unknown): AgentEvalOutput {
  const input = typeof value === 'string' ? JSON.parse(value) : value
  const output = AgentEvalOutputSchema.parse(input, {reportInput: true})
  const treatmentIds = new Set(output.treatments.map(treatment => treatment.id))
  if (treatmentIds.size !== output.treatments.length) {
    throw new Error('Treatment IDs must be unique')
  }

  for (const result of output.results) {
    if (!treatmentIds.has(result.treatmentId)) {
      throw new Error(`Result "${result.id}" references unknown treatment "${result.treatmentId}"`)
    }
  }

  return output
}

export {createAgentEvalOutput, parseAgentEvalOutput}
export type {AgentEvalOutput, AgentEvalOutputResult}
