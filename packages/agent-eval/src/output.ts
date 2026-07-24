import * as z from 'zod/mini'
import {MessageSchema, type Message} from './copilot-cli'
import type {ExperimentScenarioConfig} from './experiment-config'
import {models} from './model'
import type {Model} from './model'

type AgentEvalOutputResult = {
  id: string
  treatment: {
    config: {
      name: string
    }
    scenario: {
      id: string
      directory: string
      config: {
        prompt: string
      }
      testPath: string
    }
    experiment: {
      name: string
      description: string
      models: Array<Model>
      scenarios: Array<ExperimentScenarioConfig>
      treatments: Array<{
        name: string
      }>
    }
    id: string
    model: Model
  }
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
}

type AgentEvalOutput = {
  id: string
  experimentId: string
  results: Array<AgentEvalOutputResult>
}

const ModelSchema = z.enum(models)

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

const ExperimentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  models: z.array(ModelSchema),
  scenarios: z.array(ExperimentScenarioSchema),
  treatments: z.array(TreatmentConfigSchema),
})

const ResolvedScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  config: z.object({
    prompt: z.string(),
  }),
  testPath: z.string(),
})

const AgentEvalOutputResultSchema = z.object({
  id: z.string(),
  treatment: z.object({
    config: TreatmentConfigSchema,
    scenario: ResolvedScenarioSchema,
    experiment: ExperimentConfigSchema,
    id: z.string(),
    model: ModelSchema,
  }),
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
})

const AgentEvalOutputSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  results: z.array(AgentEvalOutputResultSchema),
})

function parseAgentEvalOutput(value: unknown): AgentEvalOutput {
  return AgentEvalOutputSchema.parse(value, {reportInput: true})
}

export {parseAgentEvalOutput}
export type {AgentEvalOutput, AgentEvalOutputResult}
