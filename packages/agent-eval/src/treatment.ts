import type {ExperimentConfig, Model, TreatmentConfig} from '@primer/agent-experiment'
import type {ResolvedEval} from './eval'

type Treatment = {
  config: TreatmentConfig
  eval: ResolvedEval
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
    tests: Array<{
      title: string
      fullName: string
      status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled'
      description?: string
    }>
  }
}

export type {Treatment, TreatmentResult}
