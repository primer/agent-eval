import {expect, test} from 'vitest'
import {hash} from '../hash'
import {VirtualHost} from '../host'
import {getExperiment, getExperimentByName} from './get'

function createHost() {
  return VirtualHost.create({
    '/experiments/copilot-comparison.ts':
      'export default {name: "Copilot Comparison", description: "Example", models: ["gpt-5.5"], scenarios: [], treatments: []}',
    '/scenarios/.gitkeep': '',
  })
}

const directories = {
  experimentsDirectory: '/experiments',
  scenariosDirectory: '/scenarios',
}

test('gets an experiment by name', async () => {
  const experiment = await getExperimentByName({...directories, host: createHost(), name: 'copilot-comparison'})

  expect(experiment).toMatchObject({id: hash('Experiment:copilot-comparison'), name: 'Copilot Comparison'})
})

test('gets an experiment by ID', async () => {
  const id = hash('Experiment:copilot-comparison')
  const experiment = await getExperiment({...directories, host: createHost(), id})

  expect(experiment).toMatchObject({id, name: 'Copilot Comparison'})
})
