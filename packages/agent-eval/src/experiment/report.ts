import type {ModelVariant} from '../model'
import type {CopilotRunner} from '../copilot-runner'
import type {RunPlanResult} from '../plan'
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
import type {ExperimentTrial} from './plan'

type ExperimentSummary = TrialSummary & {
  treatmentId: string
  treatment: string
  scenario?: string
  model?: ModelVariant
  runner: CopilotRunner
}

type CreateExperimentReportOptions = {
  experiment: Experiment
  runPlanResult: RunPlanResult<ExperimentTrial>
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
    Treatment: level === 'treatment' ? summary.treatment : '',
    ...(showRunner ? {Runner: level === 'treatment' ? summary.runner : ''} : {}),
    Scenario: level === 'treatment' ? 'All scenarios' : level === 'scenario' ? `  ${summary.scenario}` : '',
    Model: level === 'model' ? `    ${summary.model?.name}` : 'All models',
    'Reasoning Effort': level === 'model' ? (summary.model?.reasoningEffort ?? '') : '',
    ...formatTrialSummary(summary, dimensions),
  }
}

function createExperimentReport({experiment, runPlanResult}: CreateExperimentReportOptions): string {
  if (runPlanResult.results.length === 0) {
    return `Experiment: ${experiment.name}\nNo trial results.`
  }

  const treatmentSummaries = new Map<string, ExperimentSummary>()
  const scenarioSummaries = new Map<string, ExperimentSummary>()
  const modelSummaries = new Map<string, ExperimentSummary>()
  const showRunner = runPlanResult.results.some(({trial}) => {
    return trial.runner === 'copilot-sdk'
  })

  for (const {trial, result} of runPlanResult.results) {
    const values = {
      treatmentId: trial.treatment.id,
      treatment: trial.treatment.name,
      runner: trial.runner ?? 'copilot-cli',
    }
    const treatmentKey = JSON.stringify([trial.treatment.id, values.runner])
    const treatmentSummary = treatmentSummaries.get(treatmentKey) ?? {...createTrialSummary(), ...values}
    addTrialResultToSummary(treatmentSummary, result)
    treatmentSummaries.set(treatmentKey, treatmentSummary)

    const scenarioValues = {...values, scenario: trial.scenario.id}
    const scenarioKey = JSON.stringify([trial.treatment.id, values.runner, trial.scenario.id])
    const scenarioSummary = scenarioSummaries.get(scenarioKey) ?? {...createTrialSummary(), ...scenarioValues}
    addTrialResultToSummary(scenarioSummary, result)
    scenarioSummaries.set(scenarioKey, scenarioSummary)

    const modelKey = JSON.stringify([
      trial.treatment.id,
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
  for (const treatment of sortExperimentSummaries([...treatmentSummaries.values()])) {
    rows.push(formatExperimentSummary(experiment, treatment, 'treatment', dimensions, showRunner))
    const scenarios = [...scenarioSummaries.values()].filter(summary => {
      return summary.treatmentId === treatment.treatmentId && summary.runner === treatment.runner
    })

    for (const scenario of sortExperimentSummaries(scenarios)) {
      rows.push(formatExperimentSummary(experiment, scenario, 'scenario', dimensions, showRunner))
      const models = [...modelSummaries.values()].filter(summary => {
        return (
          summary.treatmentId === treatment.treatmentId &&
          summary.runner === treatment.runner &&
          summary.scenario === scenario.scenario
        )
      })
      for (const model of sortExperimentSummaries(models)) {
        rows.push(formatExperimentSummary(experiment, model, 'model', dimensions, showRunner))
      }
    }
  }

  const sections = [
    formatTable(rows, [
      'Experiment',
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
