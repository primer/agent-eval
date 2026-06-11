import type {EvalConfig, ExperimentConfig, ExperimentEvalConfig, InlineEvalConfig, TreatmentConfig} from './config'

const ControlTreatment: TreatmentConfig = {
  name: 'Control',
}

export {ControlTreatment}
export type {EvalConfig, ExperimentConfig, ExperimentEvalConfig, InlineEvalConfig, TreatmentConfig}
export type {Model} from './model'
