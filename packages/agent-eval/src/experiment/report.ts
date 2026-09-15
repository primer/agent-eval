import type {ModelVariant} from '../model'
import type {RunPlanResult} from '../plan'
import {formatTable, type TableRow} from '../report/format'
import {
  REPORT_USAGE_NOTE,
  TRIAL_SUMMARY_COLUMNS,
  addTrialResultToSummary,
  compareTrialSummaries,
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
}

type CreateExperimentReportOptions = {
  experiment: Experiment
  runPlanResult: RunPlanResult<ExperimentTrial>
}

function compareExperimentSummaries(a: ExperimentSummary, b: ExperimentSummary): number {
  return (
    compareTrialSummaries(a, b) ||
    a.treatment.localeCompare(b.treatment) ||
    (a.scenario ?? '').localeCompare(b.scenario ?? '') ||
    (a.model?.name ?? '').localeCompare(b.model?.name ?? '') ||
    (a.model?.reasoningEffort ?? '').localeCompare(b.model?.reasoningEffort ?? '')
  )
}

function formatExperimentSummary(
  experiment: Experiment,
  summary: ExperimentSummary,
  level: 'treatment' | 'scenario' | 'model',
): TableRow {
  return {
    Experiment: level === 'treatment' ? experiment.name : '',
    Treatment: level === 'treatment' ? summary.treatment : '',
    Scenario: level === 'treatment' ? 'All scenarios' : level === 'scenario' ? `  ${summary.scenario}` : '',
    Model: level === 'model' ? `    ${summary.model?.name}` : 'All models',
    'Reasoning Effort': level === 'model' ? (summary.model?.reasoningEffort ?? '') : '',
    ...formatTrialSummary(summary),
  }
}

function createExperimentReport({experiment, runPlanResult}: CreateExperimentReportOptions): string {
  if (runPlanResult.results.length === 0) {
    return `Experiment: ${experiment.name}\nNo trial results.`
  }

  const treatmentSummaries = new Map<string, ExperimentSummary>()
  const scenarioSummaries = new Map<string, ExperimentSummary>()
  const modelSummaries = new Map<string, ExperimentSummary>()

  for (const {trial, result} of runPlanResult.results) {
    const values = {
      treatmentId: trial.treatment.id,
      treatment: trial.treatment.name,
    }
    const treatmentKey = trial.treatment.id
    const treatmentSummary = treatmentSummaries.get(treatmentKey) ?? {...createTrialSummary(), ...values}
    addTrialResultToSummary(treatmentSummary, result)
    treatmentSummaries.set(treatmentKey, treatmentSummary)

    const scenarioValues = {...values, scenario: trial.scenario.id}
    const scenarioKey = JSON.stringify([trial.treatment.id, trial.scenario.id])
    const scenarioSummary = scenarioSummaries.get(scenarioKey) ?? {...createTrialSummary(), ...scenarioValues}
    addTrialResultToSummary(scenarioSummary, result)
    scenarioSummaries.set(scenarioKey, scenarioSummary)

    const modelKey = JSON.stringify([
      trial.treatment.id,
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
  for (const treatment of [...treatmentSummaries.values()].toSorted(compareExperimentSummaries)) {
    rows.push(formatExperimentSummary(experiment, treatment, 'treatment'))
    const scenarios = [...scenarioSummaries.values()].filter(summary => {
      return summary.treatmentId === treatment.treatmentId
    })

    for (const scenario of scenarios.toSorted(compareExperimentSummaries)) {
      rows.push(formatExperimentSummary(experiment, scenario, 'scenario'))
      const models = [...modelSummaries.values()].filter(summary => {
        return summary.treatmentId === treatment.treatmentId && summary.scenario === scenario.scenario
      })
      for (const model of models.toSorted(compareExperimentSummaries)) {
        rows.push(formatExperimentSummary(experiment, model, 'model'))
      }
    }
  }

  const sections = [
    formatTable(rows, ['Experiment', 'Treatment', 'Scenario', 'Model', 'Reasoning Effort', ...TRIAL_SUMMARY_COLUMNS]),
    REPORT_USAGE_NOTE,
  ]
  return sections.join('\n\n')
}

export {createExperimentReport}
