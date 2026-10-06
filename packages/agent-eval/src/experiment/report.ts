import type {ModelVariant} from '../model'
import type {CopilotRunner} from '../copilot-runner'
import {formatTable, type TableRow} from '../report/format'
import {getCheckDimensions, type CheckDimension} from '../report/checks'
import {
  REPORT_CHECKS_NOTE,
  REPORT_USAGE_NOTE,
  TRIAL_SUMMARY_COLUMNS,
  addTrialResultToSummary,
  createTrialSummaryComparator,
  createTrialSummary,
  formatTrialSummary,
  type TrialSummary,
} from '../trial/report'
import type {Experiment} from './experiment'
import type {Trial} from '../trial/trial'
import type {ExperimentRunResult} from './run'

type ExperimentSummary = TrialSummary & {
  treatmentId: string
  treatment: string
  scenario?: string
  model?: ModelVariant
  runner: CopilotRunner
  capabilityId?: string
  capability?: string
}

function getSummaryValues(
  trial: Trial,
): Pick<ExperimentSummary, 'treatmentId' | 'treatment' | 'runner' | 'capabilityId' | 'capability'> {
  return {
    treatmentId: trial.treatment.id,
    treatment: trial.treatment.name,
    runner: trial.runner ?? 'copilot-cli',
  }
}

function compareExperimentNames(a: ExperimentSummary, b: ExperimentSummary): number {
  return (
    a.treatment.localeCompare(b.treatment) ||
    a.runner.localeCompare(b.runner) ||
    (a.scenario ?? '').localeCompare(b.scenario ?? '') ||
    (a.model?.name ?? '').localeCompare(b.model?.name ?? '') ||
    (a.model?.reasoningEffort ?? '').localeCompare(b.model?.reasoningEffort ?? '')
  )
}

function sortExperimentSummaries(summaries: Array<ExperimentSummary>): Array<ExperimentSummary> {
  const compare = createTrialSummaryComparator(summaries)
  return summaries.toSorted((a, b) => {
    return compare(a, b) || compareExperimentNames(a, b)
  })
}

function formatExperimentSummary(
  experiment: Experiment,
  summary: ExperimentSummary,
  level: 'treatment' | 'scenario' | 'model',
  dimensions: Array<CheckDimension>,
  showRunner: boolean,
): TableRow {
  return {
    Experiment: level === 'treatment' ? experiment.name : '',
    ...(experiment.type === 'benchmark' ? {Capability: level === 'treatment' ? summary.capability : ''} : {}),
    Treatment: level === 'treatment' ? summary.treatment : '',
    ...(showRunner ? {Runner: level === 'treatment' ? summary.runner : ''} : {}),
    Scenario: level === 'treatment' ? 'All scenarios' : level === 'scenario' ? `  ${summary.scenario}` : '',
    Model: level === 'model' ? `    ${summary.model?.name}` : 'All models',
    'Reasoning Effort': level === 'model' ? (summary.model?.reasoningEffort ?? '') : '',
    ...formatTrialSummary(summary, dimensions),
  }
}

function createExperimentReport(run: ExperimentRunResult): string {
  const {experiment} = run
  if (run.runPlanResult.results.length === 0) {
    return `Experiment: ${experiment.name}\nNo trial results.`
  }

  const treatmentSummaries = new Map<string, ExperimentSummary>()
  const scenarioSummaries = new Map<string, ExperimentSummary>()
  const modelSummaries = new Map<string, ExperimentSummary>()
  const showRunner = run.runPlanResult.results.some(({trial}) => {
    return trial.runner === 'copilot-sdk'
  })

  const entries =
    run.type === 'benchmark'
      ? run.runPlanResult.results.map(entry => {
          return {
            ...entry,
            values: {
              ...getSummaryValues(entry.trial),
              capabilityId: entry.trial.capability.id,
              capability: entry.trial.capability.name,
            },
          }
        })
      : run.runPlanResult.results.map(entry => {
          return {
            ...entry,
            values: getSummaryValues(entry.trial),
          }
        })

  for (const {trial, result, values} of entries) {
    const treatmentKey = JSON.stringify([values.capabilityId, trial.treatment.id, values.runner])
    const treatmentSummary = treatmentSummaries.get(treatmentKey) ?? {...createTrialSummary(), ...values}
    addTrialResultToSummary(treatmentSummary, result)
    treatmentSummaries.set(treatmentKey, treatmentSummary)

    const scenarioValues = {...values, scenario: trial.scenario.id}
    const scenarioKey = JSON.stringify([values.capabilityId, trial.treatment.id, values.runner, trial.scenario.id])
    const scenarioSummary = scenarioSummaries.get(scenarioKey) ?? {...createTrialSummary(), ...scenarioValues}
    addTrialResultToSummary(scenarioSummary, result)
    scenarioSummaries.set(scenarioKey, scenarioSummary)

    const modelKey = JSON.stringify([
      trial.treatment.id,
      values.capabilityId,
      values.runner,
      trial.scenario.id,
      trial.model.name,
      trial.model.reasoningEffort,
    ])
    const modelSummary = modelSummaries.get(modelKey) ?? {
      ...createTrialSummary(),
      ...scenarioValues,
      model: trial.model,
    }
    addTrialResultToSummary(modelSummary, result)
    modelSummaries.set(modelKey, modelSummary)
  }

  const rows: Array<TableRow> = []
  const dimensions = getCheckDimensions([...treatmentSummaries.values()])
  const groups =
    experiment.type === 'benchmark'
      ? experiment.benchmark.capabilities.map(capability => {
          return [...treatmentSummaries.values()].filter(summary => {
            return summary.capabilityId === capability.id
          })
        })
      : [[...treatmentSummaries.values()]]
  for (const group of groups) {
    for (const treatment of sortExperimentSummaries(group)) {
      rows.push(formatExperimentSummary(experiment, treatment, 'treatment', dimensions, showRunner))
      const scenarios = [...scenarioSummaries.values()].filter(summary => {
        return (
          summary.capabilityId === treatment.capabilityId &&
          summary.treatmentId === treatment.treatmentId &&
          summary.runner === treatment.runner
        )
      })

      for (const scenario of sortExperimentSummaries(scenarios)) {
        rows.push(formatExperimentSummary(experiment, scenario, 'scenario', dimensions, showRunner))
        const models = [...modelSummaries.values()].filter(summary => {
          return (
            summary.treatmentId === treatment.treatmentId &&
            summary.capabilityId === treatment.capabilityId &&
            summary.runner === treatment.runner &&
            summary.scenario === scenario.scenario
          )
        })
        for (const model of sortExperimentSummaries(models)) {
          rows.push(formatExperimentSummary(experiment, model, 'model', dimensions, showRunner))
        }
      }
    }
  }

  const sections = [
    formatTable(rows, [
      'Experiment',
      ...(experiment.type === 'benchmark' ? ['Capability'] : []),
      'Treatment',
      ...(showRunner ? ['Runner'] : []),
      'Scenario',
      'Model',
      'Reasoning Effort',
      ...TRIAL_SUMMARY_COLUMNS.slice(0, 1),
      ...(dimensions.length > 0 ? ['Checks'] : []),
      ...TRIAL_SUMMARY_COLUMNS.slice(1),
    ]),
    ...(dimensions.length > 0 ? [REPORT_CHECKS_NOTE] : []),
    REPORT_USAGE_NOTE,
  ]
  return sections.join('\n\n')
}

export {createExperimentReport}
