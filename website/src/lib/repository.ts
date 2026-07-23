import 'server-only'

import {randomUUID} from 'node:crypto'
import type {
  CreateExperimentInput,
  CreateScenarioInput,
  DashboardSnapshot,
  Experiment,
  ExperimentRun,
  ModelId,
  Scenario,
  UpdateExperimentInput,
  UpdateScenarioInput,
} from './domain'

type Store = {
  experiments: Experiment[]
  scenarios: Scenario[]
  runs: ExperimentRun[]
}

const seededScenarios: Scenario[] = [
  {
    id: '001-agent-uses-button-from-primer',
    name: 'Agent uses a primary button',
    description: 'Checks whether an agent selects and configures the Primer Button component.',
    prompt: "Update the index page to use a primary button with the text 'Submit'",
    tags: ['react', 'component', 'button'],
    testPath: 'scenarios/001-agent-uses-button-from-primer/scenario.test.ts',
    updatedAt: '2026-07-18T16:20:00.000Z',
    baseline: {
      id: 'baseline-button-gpt-55',
      model: 'gpt-5.5',
      recordedAt: '2026-07-18T16:20:00.000Z',
      status: 'passing',
      tests: {passed: 4, failed: 0, skipped: 0},
      metrics: {turns: 7, outputTokens: 866, premiumRequests: 1, durationMs: 24290},
    },
  },
  {
    id: '002-agent-uses-octicon-from-primer',
    name: 'Agent uses an Octicon',
    description: 'Checks whether an agent finds and renders the appropriate Primer icon.',
    prompt: 'Update the index page to use a Search icon',
    tags: ['react', 'icon', 'octicon'],
    testPath: 'scenarios/002-agent-uses-octicon-from-primer/scenario.test.ts',
    updatedAt: '2026-07-19T14:10:00.000Z',
    baseline: {
      id: 'baseline-octicon-gpt-55',
      model: 'gpt-5.5',
      recordedAt: '2026-07-19T14:10:00.000Z',
      status: 'passing',
      tests: {passed: 3, failed: 0, skipped: 0},
      metrics: {turns: 6, outputTokens: 712, premiumRequests: 1, durationMs: 19840},
    },
  },
  {
    id: '003-agent-uses-form-from-primer',
    name: 'Agent builds a sign-up form',
    description: 'Evaluates component selection, form semantics, and accessible labeling.',
    prompt:
      'Update the index page to render a sign-up form. The form does not need to post to an endpoint, I am only working on the UI for now.',
    tags: ['react', 'form', 'accessibility'],
    testPath: 'scenarios/003-agent-uses-form-from-primer/scenario.test.ts',
    updatedAt: '2026-07-20T09:30:00.000Z',
    baseline: {
      id: 'baseline-form-gpt-55',
      model: 'gpt-5.5',
      recordedAt: '2026-07-20T09:30:00.000Z',
      status: 'failing',
      tests: {passed: 4, failed: 1, skipped: 0},
      metrics: {turns: 9, outputTokens: 1284, premiumRequests: 1, durationMs: 31850},
    },
  },
]

const seededExperiments: Experiment[] = [
  {
    id: 'mcp',
    name: 'MCP',
    description: 'Compare MCP versus local instructions performance for Primer usage.',
    models: ['gpt-5.5', 'claude-opus-4.7', 'claude-sonnet-4.6'],
    scenarioIds: ['001-agent-uses-button-from-primer', '002-agent-uses-octicon-from-primer'],
    treatments: [
      {
        id: 'mcp-with-local-instructions',
        name: 'MCP with local instructions',
        description: 'Install the Primer MCP server and add local instructions directing the agent to it.',
      },
      {
        id: 'local-instructions',
        name: 'Local instructions',
        description: 'Use repository instructions that direct the agent to Primer documentation.',
      },
    ],
    updatedAt: '2026-07-22T18:05:00.000Z',
  },
  {
    id: 'mcp-with-server-instructions',
    name: 'MCP with server instructions',
    description: 'Compare Primer MCP behavior with and without server-provided instructions.',
    models: ['gpt-5.5'],
    scenarioIds: ['001-agent-uses-button-from-primer', '002-agent-uses-octicon-from-primer'],
    treatments: [
      {
        id: 'with-server-instructions',
        name: 'MCP with server instructions',
        description: 'Run the MCP build that includes server instructions.',
      },
      {
        id: 'without-server-instructions',
        name: 'MCP without server instructions',
        description: 'Run the latest MCP build without server instructions.',
      },
    ],
    updatedAt: '2026-07-23T13:45:00.000Z',
  },
]

const seededRuns: ExperimentRun[] = [
  {
    id: 'run-mcp-2026-07-22',
    experimentId: 'mcp',
    status: 'completed',
    queuedAt: '2026-07-22T18:06:00.000Z',
    completedAt: '2026-07-22T18:28:00.000Z',
    results: [
      {
        scenarioId: '001-agent-uses-button-from-primer',
        treatmentId: 'mcp-with-local-instructions',
        model: 'gpt-5.5',
        tests: {passed: 4, failed: 0, skipped: 0},
        metrics: {turns: 6, outputTokens: 780, premiumRequests: 1, durationMs: 22140},
      },
      {
        scenarioId: '002-agent-uses-octicon-from-primer',
        treatmentId: 'mcp-with-local-instructions',
        model: 'gpt-5.5',
        tests: {passed: 3, failed: 0, skipped: 0},
        metrics: {turns: 5, outputTokens: 640, premiumRequests: 1, durationMs: 18790},
      },
      {
        scenarioId: '001-agent-uses-button-from-primer',
        treatmentId: 'local-instructions',
        model: 'gpt-5.5',
        tests: {passed: 3, failed: 1, skipped: 0},
        metrics: {turns: 8, outputTokens: 1012, premiumRequests: 1, durationMs: 27930},
      },
      {
        scenarioId: '002-agent-uses-octicon-from-primer',
        treatmentId: 'local-instructions',
        model: 'gpt-5.5',
        tests: {passed: 3, failed: 0, skipped: 0},
        metrics: {turns: 7, outputTokens: 894, premiumRequests: 1, durationMs: 24600},
      },
    ],
  },
]

const globalStore = globalThis as typeof globalThis & {agentEvalWebsiteStore?: Store}

function getStore(): Store {
  globalStore.agentEvalWebsiteStore ??= {
    experiments: structuredClone(seededExperiments),
    scenarios: structuredClone(seededScenarios),
    runs: structuredClone(seededRuns),
  }
  return globalStore.agentEvalWebsiteStore
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function uniqueId(value: string, existingIds: string[]): string {
  const base = slugify(value) || randomUUID()
  let id = base
  let suffix = 2
  while (existingIds.includes(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

export function listExperiments(): Experiment[] {
  return getStore().experiments.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getExperiment(id: string): Experiment | undefined {
  return getStore().experiments.find(experiment => experiment.id === id)
}

export function createExperiment(input: CreateExperimentInput): Experiment {
  const store = getStore()
  const experiment: Experiment = {
    ...input,
    id: uniqueId(
      input.name,
      store.experiments.map(item => item.id),
    ),
    treatments: input.treatments.map(treatment => ({
      ...treatment,
      id: uniqueId(treatment.name, []),
    })),
    updatedAt: new Date().toISOString(),
  }
  store.experiments.push(experiment)
  return experiment
}

export function updateExperiment(id: string, input: UpdateExperimentInput): Experiment {
  const store = getStore()
  const index = store.experiments.findIndex(experiment => experiment.id === id)
  if (index === -1) {
    throw new Error(`Experiment with id "${id}" was not found.`)
  }
  const experiment: Experiment = {
    ...store.experiments[index],
    ...input,
    treatments: input.treatments.map(treatment => ({
      ...treatment,
      id: uniqueId(treatment.name, []),
    })),
    updatedAt: new Date().toISOString(),
  }
  store.experiments[index] = experiment
  return experiment
}

export function queueExperimentRun(experimentId: string): ExperimentRun {
  if (!getExperiment(experimentId)) {
    throw new Error(`Experiment with id "${experimentId}" was not found.`)
  }
  const run: ExperimentRun = {
    id: randomUUID(),
    experimentId,
    status: 'queued',
    queuedAt: new Date().toISOString(),
    results: [],
  }
  getStore().runs.unshift(run)
  return run
}

export function listRuns(experimentId?: string): ExperimentRun[] {
  return getStore()
    .runs.filter(run => !experimentId || run.experimentId === experimentId)
    .toSorted((a, b) => b.queuedAt.localeCompare(a.queuedAt))
}

export function listScenarios(): Scenario[] {
  return getStore().scenarios.toSorted((a, b) => a.id.localeCompare(b.id))
}

export function getScenario(id: string): Scenario | undefined {
  return getStore().scenarios.find(scenario => scenario.id === id)
}

export function createScenario(input: CreateScenarioInput): Scenario {
  const store = getStore()
  const nextNumber =
    Math.max(0, ...store.scenarios.map(scenario => Number.parseInt(scenario.id.match(/^\d+/)?.[0] ?? '0', 10))) + 1
  const slug = slugify(input.name) || randomUUID()
  const scenario: Scenario = {
    ...input,
    id: `${String(nextNumber).padStart(3, '0')}-${slug}`,
    testPath: `scenarios/${String(nextNumber).padStart(3, '0')}-${slug}/scenario.test.ts`,
    updatedAt: new Date().toISOString(),
  }
  store.scenarios.push(scenario)
  return scenario
}

export function updateScenario(id: string, input: UpdateScenarioInput): Scenario {
  const store = getStore()
  const index = store.scenarios.findIndex(scenario => scenario.id === id)
  if (index === -1) {
    throw new Error(`Scenario with id "${id}" was not found.`)
  }
  const scenario: Scenario = {
    ...store.scenarios[index],
    ...input,
    updatedAt: new Date().toISOString(),
  }
  store.scenarios[index] = scenario
  return scenario
}

export function getDashboardSnapshot(): DashboardSnapshot {
  const scenarios = listScenarios()
  const baselines = scenarios.flatMap(scenario => (scenario.baseline ? [scenario.baseline] : []))
  const tests = baselines.reduce(
    (summary, baseline) => ({
      passed: summary.passed + baseline.tests.passed,
      failed: summary.failed + baseline.tests.failed,
      skipped: summary.skipped + baseline.tests.skipped,
    }),
    {passed: 0, failed: 0, skipped: 0},
  )
  const totalDuration = baselines.reduce((total, baseline) => total + baseline.metrics.durationMs, 0)

  return {
    baseline: {
      scenarios: scenarios.length,
      passing: baselines.filter(baseline => baseline.status === 'passing').length,
      tests,
      averageDurationMs: baselines.length === 0 ? 0 : totalDuration / baselines.length,
    },
    experiments: listExperiments(),
    scenarios,
    recentRuns: listRuns().slice(0, 5),
  }
}

export function isModelId(value: string): value is ModelId {
  return [
    'claude-haiku-4.5',
    'claude-opus-4.6',
    'claude-opus-4.7',
    'claude-sonnet-4.5',
    'claude-sonnet-4.6',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.5',
  ].includes(value)
}
