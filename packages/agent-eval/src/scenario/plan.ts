import {randomUUID} from 'node:crypto'
import type {CopilotRunner} from '../copilot-runner'
import {createPlan, type Plan} from '../plan'
import {createTreatment} from '../treatment'
import type {Scenario} from './scenario'

type CreateScenarioPlanOptions = {
  scenario: Scenario
  runner?: CopilotRunner
}

function createScenarioPlan({scenario, runner = 'copilot-cli'}: CreateScenarioPlanOptions): Plan {
  return createPlan({
    trials: [
      {
        id: randomUUID(),
        scenario,
        runner,
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
