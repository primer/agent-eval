import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {getBenchmark} from './get'

function createHost() {
  return VirtualHost.create({
    '/benchmarks/design-system.ts':
      'export default {name: "Design System", description: "Example", models: ["gpt-5.5"], capabilities: []}',
    '/scenarios/.gitkeep': '',
  })
}

const directories = {
  benchmarksDirectory: '/benchmarks',
  scenariosDirectory: '/scenarios',
}

test('gets a benchmark by name', async () => {
  const benchmark = await getBenchmark({...directories, host: createHost(), name: 'Design System'})

  expect(benchmark).toMatchObject({id: 'design-system', name: 'Design System'})
})

test('gets a benchmark by ID', async () => {
  const benchmark = await getBenchmark({...directories, host: createHost(), id: 'design-system'})

  expect(benchmark).toMatchObject({id: 'design-system', name: 'Design System'})
})
