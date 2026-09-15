import {randomUUID} from 'node:crypto'
import {createPlan, type Plan} from '../plan'
import {createTreatment, type Treatment} from '../treatment'
import type {Scenario} from './scenario'

type CreateScenarioPlanOptions = {
  scenario: Scenario
}

function createScenarioPlan({scenario}: CreateScenarioPlanOptions): Plan {
  return createPlan({
    trials: [
      {
        id: randomUUID(),
        scenario,
        treatment: createTreatment({
          name: 'Scenario',
        }),
        model: {
          name: 'gpt-5.6-luna',
          reasoningEffort: 'low',
        },
      },
    ],
  })
}

export {createScenarioPlan}
