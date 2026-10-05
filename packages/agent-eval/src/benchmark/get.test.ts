import {expect, test} from 'vitest'
import {hash} from '../hash'
import {VirtualHost} from '../host'
import {getBenchmark, getBenchmarkByName} from './get'

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
  const benchmark = await getBenchmarkByName({...directories, host: createHost(), name: 'design-system'})

  expect(benchmark).toMatchObject({id: hash('Benchmark:design-system'), name: 'Design System'})
})

test('gets a benchmark by ID', async () => {
  const id = hash('Benchmark:design-system')
  const benchmark = await getBenchmark({...directories, host: createHost(), id})

  expect(benchmark).toMatchObject({id, name: 'Design System'})
})
