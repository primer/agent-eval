import type {ExperimentConfig, TreatmentConfig} from './config.ts'

const ControlTreatment: TreatmentConfig = {
  name: 'Control',
}

export {ControlTreatment}
export type {ExperimentConfig, TreatmentConfig}
export type {Model} from './model'
