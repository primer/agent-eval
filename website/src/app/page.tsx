import type {AgentEvalOutput, AgentEvalOutputResult} from '@primer/agent-eval/output'
import {Index, type BaselineComparison} from './components/Index'
import {list as listExperiments} from '../experiments'
import {latest as getLatestRun} from '../runs'
import {list as listScenarios} from '../scenarios'

type TreatmentResults = {
  control?: AgentEvalOutputResult
  baseline?: AgentEvalOutputResult
}

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

function getResultKey(scenarioId: string, model: string, reasoningEffort: string) {
  return JSON.stringify([scenarioId, model, reasoningEffort])
}

function getMetricDelta(
  control: number | undefined,
  baseline: number | undefined,
  preferredDirection: 'higher' | 'lower',
): string {
  if (control === undefined || baseline === undefined) {
    return '—'
  }

  if (control === baseline) {
    return '0%'
  }

  const percentage = control === 0 ? 100 : (Math.abs(baseline - control) / Math.abs(control)) * 100
  const improved = preferredDirection === 'higher' ? baseline > control : baseline < control
  return `${improved ? '+' : '-'}${percentFormatter.format(percentage)}%`
}

function getTestPassRate(result: AgentEvalOutputResult | undefined) {
  if (!result) {
    return undefined
  }

  if (result.testResults.numTotalTests === 0) {
    return 0
  }

  return result.testResults.numPassedTests / result.testResults.numTotalTests
}

function countToolCalls(result: AgentEvalOutputResult | undefined) {
  if (!result) {
    return undefined
  }

  return Object.values(result.assistant.tools).reduce((total, count) => total + count, 0)
}

function getBaselineComparisons(output: AgentEvalOutput): Array<BaselineComparison> {
  const controlTreatment = output.treatments.find(treatment => treatment.config.name === 'Control')
  const baselineTreatment = output.treatments.find(treatment => treatment.config.name === 'Recommended')

  if (!controlTreatment || !baselineTreatment) {
    throw new Error('The latest baseline run must include Control and Recommended treatments')
  }

  const results = new Map<string, TreatmentResults>()
  for (const scenario of output.scenarios) {
    for (const model of output.experiment.models) {
      for (const reasoningEffort of model.reasoningEfforts) {
        results.set(getResultKey(scenario.id, model.name, reasoningEffort), {})
      }
    }
  }

  for (const result of output.results) {
    const reasoningEffort = result.reasoningEffort ?? 'high'
    const key = getResultKey(result.scenarioId, result.model, reasoningEffort)
    const treatmentResults = results.get(key)
    if (!treatmentResults) {
      throw new Error(`Result "${result.id}" does not match a configured scenario, model, and reasoning effort`)
    }

    if (result.treatmentId === controlTreatment.id) {
      treatmentResults.control = result
    } else if (result.treatmentId === baselineTreatment.id) {
      treatmentResults.baseline = result
    }
  }

  return Array.from(results, ([key, treatmentResults]) => {
    const [scenarioId, model, reasoningEffort] = JSON.parse(key) as [string, string, string]
    const {control, baseline} = treatmentResults
    const controlToolCalls = countToolCalls(control)
    const baselineToolCalls = countToolCalls(baseline)

    return {
      id: key,
      scenarioId,
      model,
      reasoningEffort,
      tests: getMetricDelta(getTestPassRate(control), getTestPassRate(baseline), 'higher'),
      turns: getMetricDelta(control?.assistant.turns, baseline?.assistant.turns, 'lower'),
      outputTokens: getMetricDelta(control?.assistant.outputTokens, baseline?.assistant.outputTokens, 'lower'),
      premiumRequests: getMetricDelta(control?.assistant.premiumRequests, baseline?.assistant.premiumRequests, 'lower'),
      apiDuration: getMetricDelta(
        control?.assistant.totalApiDurationMs,
        baseline?.assistant.totalApiDurationMs,
        'lower',
      ),
      sessionDuration: getMetricDelta(
        control?.assistant.sessionDurationMs,
        baseline?.assistant.sessionDurationMs,
        'lower',
      ),
      toolCalls: getMetricDelta(controlToolCalls, baselineToolCalls, 'lower'),
    }
  })
}

export default async function IndexPage() {
  const [experiments, latestRun, scenarios] = await Promise.all([listExperiments(), getLatestRun(), listScenarios()])
  const baseline = latestRun ? getBaselineComparisons(latestRun.output) : null

  return <Index baseline={baseline} experiments={experiments} scenarios={scenarios} />
}
