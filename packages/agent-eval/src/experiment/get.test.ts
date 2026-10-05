import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {getExperiment} from './get'

function createHost() {
  return VirtualHost.create({
    '/experiments/copilot-comparison.ts':
      'export default {name: "Copilot Comparison", description: "Example", models: ["gpt-5.5"], scenarios: [], treatments: []}',
    '/experiments/other.ts':
      'export default {name: "copilot-comparison", description: "Example", models: ["gpt-5.5"], scenarios: [], treatments: []}',
    '/scenarios/.gitkeep': '',
  })
}

const directories = {
  experimentsDirectory: '/experiments',
  scenariosDirectory: '/scenarios',
}

test('gets an experiment by name', async () => {
  const experiment = await getExperiment({...directories, host: createHost(), name: 'Copilot Comparison'})

  expect(experiment).toMatchObject({id: 'copilot-comparison', name: 'Copilot Comparison'})
})

test('gets an experiment by ID', async () => {
  const experiment = await getExperiment({...directories, host: createHost(), id: 'copilot-comparison'})

  expect(experiment).toMatchObject({id: 'copilot-comparison', name: 'Copilot Comparison'})
})

test('preserves ID precedence for legacy name lookup', async () => {
  const experiment = await getExperiment({...directories, host: createHost(), name: 'copilot-comparison'})

  expect(experiment).toMatchObject({id: 'copilot-comparison', name: 'Copilot Comparison'})
})
