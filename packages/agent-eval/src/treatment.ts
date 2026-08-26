import type {ExperimentConfig, TreatmentConfig} from './experiment-config'
import type {Model, ReasoningEffort} from './model'
import type {Message} from './copilot-cli'
import type {ResolvedScenario} from './resolve-experiment-scenario'

type Treatment = {
  config: TreatmentConfig
  scenario: ResolvedScenario
  experiment: ExperimentConfig
  id: string
  model: Model
  reasoningEffort?: ReasoningEffort
}

type TreatmentResult = {
  id: string
  treatment: Treatment
  artifacts: {
    copilotConfigPath: string
    directory: string
    skillsConfigPath: string
    testResultsPath: string
    walkthroughPath: string
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
  walkthrough: {}
}

type Walkthrough =
  | {type: 'Unavailable'}
  | {type: 'Screenshot'; filepath: string}
  | {type: 'Screenshots'; screenshots: Array<string>}
  | {type: 'Video'; filepath: string}

export type {Treatment, TreatmentResult, Walkthrough}
