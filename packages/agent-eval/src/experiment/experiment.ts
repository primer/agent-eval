import type {ExperimentConfig} from './config'
import type {ModelVariant} from '../model'
import type {Scenario} from '../scenario/scenario'
import type {Treatment, TreatmentSetup} from '../treatment'

type Experiment = {
  id: string
  filepath: string
  name: ExperimentConfig['name']
  description: ExperimentConfig['description']
  models: Array<ModelVariant>
  runners?: ExperimentConfig['runners']
  scenarios: Array<Scenario>
  setup?: TreatmentSetup
  treatments: Array<Treatment>
}

export type {Experiment}
