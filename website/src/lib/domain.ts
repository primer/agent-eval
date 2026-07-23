export const modelIds = [
  'claude-haiku-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
] as const

export type ModelId = (typeof modelIds)[number]
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed'

export type TestSummary = {
  passed: number
  failed: number
  skipped: number
}

export type AgentMetrics = {
  turns: number
  outputTokens: number
  premiumRequests: number
  durationMs: number
}

export type ScenarioBaseline = {
  id: string
  model: ModelId
  recordedAt: string
  status: 'passing' | 'failing' | 'missing'
  tests: TestSummary
  metrics: AgentMetrics
}

export type Scenario = {
  id: string
  name: string
  description: string
  prompt: string
  tags: string[]
  testPath: string
  updatedAt: string
  baseline?: ScenarioBaseline
}

export type Treatment = {
  id: string
  name: string
  description: string
}

export type Experiment = {
  id: string
  name: string
  description: string
  models: ModelId[]
  scenarioIds: string[]
  treatments: Treatment[]
  updatedAt: string
}

export type ExperimentRunResult = {
  scenarioId: string
  treatmentId: string
  model: ModelId
  tests: TestSummary
  metrics: AgentMetrics
}

export type ExperimentRun = {
  id: string
  experimentId: string
  status: RunStatus
  queuedAt: string
  completedAt?: string
  results: ExperimentRunResult[]
}

export type DashboardSnapshot = {
  baseline: {
    scenarios: number
    passing: number
    tests: TestSummary
    averageDurationMs: number
  }
  experiments: Experiment[]
  scenarios: Scenario[]
  recentRuns: ExperimentRun[]
}

export type CreateExperimentInput = Pick<Experiment, 'name' | 'description' | 'models' | 'scenarioIds'> & {
  treatments: Array<Pick<Treatment, 'name' | 'description'>>
}

export type UpdateExperimentInput = CreateExperimentInput

export type CreateScenarioInput = Pick<Scenario, 'name' | 'description' | 'prompt' | 'tags'>
export type UpdateScenarioInput = CreateScenarioInput
