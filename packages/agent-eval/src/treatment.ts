import type {Eval} from '@primer/agent-evals'
import type {ExperimentConfig, Model, TreatmentConfig} from '@primer/agent-experiment'

type Treatment = {
  config: TreatmentConfig
  eval: Eval
  experiment: ExperimentConfig
  id: string
  model: Model
}

type TreatmentResult = {
  id: string
  treatment: Treatment
  artifacts: {
    copilotConfigPath: string
    directory: string
    skillsConfigPath: string
    testResultsPath: string
    workspacePath: string
  }
  assistant: {
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
  }
}

export type {Treatment, TreatmentResult}
