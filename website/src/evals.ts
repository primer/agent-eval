import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import rawResults from '../../packages/agent-eval/results.json'

type RawResult = {
  id: string
  treatment: {
    config: {
      name: string
    }
    eval: {
      id: string
      config: {
        prompt: string
      }
    }
    model: string
  }
  assistant: {
    turns: number
    outputTokens: number
    premiumRequests: number
    sessionDurationMs: number
  }
  testResults: {
    numPassedTests: number
    numTotalTests: number
  }
}

export type ScoreSummary = {
  compliance: number
  averageChecksPassed: number
  checksPerRun: number
  averageLatencyMs: number
  averageTurns: number
  averageOutputTokens: number
  averagePremiumRequests: number
  runCount: number
}

export type ModelSummary = ScoreSummary & {
  id: string
  isBest: boolean
}

export type EvalSummary = ScoreSummary & {
  id: string
  title: string
  description: string
  prompt: string
  bestModel: string
  modelCount: number
  treatmentCount: number
}

export type EvalDetail = EvalSummary & {
  complianceChecks: Array<string>
  models: Array<ModelSummary>
  treatments: Array<string>
}

export type DashboardData = {
  evals: Array<EvalSummary>
  evalCount: number
  modelCount: number
  runCount: number
  compliance: number
}

const results: Array<RawResult> = rawResults

const descriptions: Record<string, string> = {
  '001-agent-uses-button-from-primer':
    'Evaluates whether an agent chooses the Primer Button component and configures the requested primary action.',
  '002-agent-uses-octicon-from-primer':
    'Evaluates whether an agent uses the Primer SearchIcon instead of introducing a custom icon.',
  '003-agent-uses-form-from-primer':
    'Evaluates whether an agent builds a semantic sign-up form from the appropriate Primer form components.',
  '004-agent-uses-design-tokens-from-primer':
    'Evaluates whether an agent combines Primer React components with design tokens instead of hard-coded visual values.',
}

function titleFromId(id: string): string {
  const title = id
    .replace(/^\d+-/, '')
    .split('-')
    .map(word => {
      if (word === 'primer') {
        return 'Primer'
      }
      return word
    })
    .join(' ')

  return title.charAt(0).toUpperCase() + title.slice(1)
}

function descriptionFromId(id: string, title: string): string {
  return descriptions[id] ?? `Evaluates whether an agent successfully completes the “${title}” scenario.`
}

function summarize(runs: Array<RawResult>): ScoreSummary {
  const totals = runs.reduce(
    (summary, run) => {
      summary.passedTests += run.testResults.numPassedTests
      summary.totalTests += run.testResults.numTotalTests
      summary.latencyMs += run.assistant.sessionDurationMs
      summary.turns += run.assistant.turns
      summary.outputTokens += run.assistant.outputTokens
      summary.premiumRequests += run.assistant.premiumRequests
      return summary
    },
    {
      passedTests: 0,
      totalTests: 0,
      latencyMs: 0,
      turns: 0,
      outputTokens: 0,
      premiumRequests: 0,
    },
  )
  const runCount = runs.length

  return {
    compliance: totals.totalTests === 0 ? 0 : (totals.passedTests / totals.totalTests) * 100,
    averageChecksPassed: runCount === 0 ? 0 : totals.passedTests / runCount,
    checksPerRun: runs.reduce((max, run) => Math.max(max, run.testResults.numTotalTests), 0),
    averageLatencyMs: runCount === 0 ? 0 : totals.latencyMs / runCount,
    averageTurns: runCount === 0 ? 0 : totals.turns / runCount,
    averageOutputTokens: runCount === 0 ? 0 : totals.outputTokens / runCount,
    averagePremiumRequests: runCount === 0 ? 0 : totals.premiumRequests / runCount,
    runCount,
  }
}

function compareModels(a: ModelSummary, b: ModelSummary): number {
  return (
    b.compliance - a.compliance ||
    a.averageLatencyMs - b.averageLatencyMs ||
    a.averageOutputTokens - b.averageOutputTokens ||
    a.id.localeCompare(b.id)
  )
}

function groupBy<T>(items: Array<T>, getKey: (item: T) => string): Map<string, Array<T>> {
  const groups = new Map<string, Array<T>>()

  for (const item of items) {
    const key = getKey(item)
    const group = groups.get(key)
    if (group) {
      group.push(item)
    } else {
      groups.set(key, [item])
    }
  }

  return groups
}

async function readComplianceChecks(id: string): Promise<Array<string>> {
  const testPath = path.resolve(process.cwd(), '..', 'evals', id, 'eval.test.ts')

  let source: string
  try {
    source = await fs.readFile(testPath, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  return Array.from(source.matchAll(/\btest\(\s*(['"`])(.+?)\1\s*,/g), match => match[2])
}

function buildModelSummaries(runs: Array<RawResult>): Array<ModelSummary> {
  const summaries = Array.from(
    groupBy(runs, run => run.treatment.model),
    ([id, modelRuns]) => ({
      id,
      isBest: false,
      ...summarize(modelRuns),
    }),
  ).sort(compareModels)

  return summaries.map((summary, index) => ({
    ...summary,
    isBest: index === 0,
  }))
}

async function buildEvalDetail(id: string, runs: Array<RawResult>): Promise<EvalDetail> {
  const firstRun = runs[0]
  if (!firstRun) {
    throw new Error(`No results found for eval ${id}`)
  }

  const title = titleFromId(id)
  const models = buildModelSummaries(runs)
  const treatments = Array.from(new Set(runs.map(run => run.treatment.config.name))).sort()

  return {
    id,
    title,
    description: descriptionFromId(id, title),
    prompt: firstRun.treatment.eval.config.prompt,
    bestModel: models[0]?.id ?? 'No model',
    modelCount: models.length,
    treatmentCount: treatments.length,
    treatments,
    complianceChecks: await readComplianceChecks(id),
    models,
    ...summarize(runs),
  }
}

export async function getAllEvals(): Promise<Array<EvalDetail>> {
  const evalGroups = groupBy(results, result => result.treatment.eval.id)
  const evals = await Promise.all(
    Array.from(evalGroups, ([id, runs]) => {
      return buildEvalDetail(id, runs)
    }),
  )

  return evals.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}))
}

export async function getEval(id: string): Promise<EvalDetail | undefined> {
  const runs = results.filter(result => result.treatment.eval.id === id)
  if (runs.length === 0) {
    return undefined
  }
  return buildEvalDetail(id, runs)
}

export async function getDashboardData(): Promise<DashboardData> {
  const evals = await getAllEvals()
  const totalPassed = results.reduce((total, result) => total + result.testResults.numPassedTests, 0)
  const totalChecks = results.reduce((total, result) => total + result.testResults.numTotalTests, 0)

  return {
    evals,
    evalCount: evals.length,
    modelCount: new Set(results.map(result => result.treatment.model)).size,
    runCount: results.length,
    compliance: totalChecks === 0 ? 0 : (totalPassed / totalChecks) * 100,
  }
}
