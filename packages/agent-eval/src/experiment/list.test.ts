import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {defineConfig} from './config'
import {getExperiment} from './get'
import {listExperiments} from './list'
import {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest} from './plan'

function config(id?: string): string {
  return `export default ${JSON.stringify({
    id,
    name: 'Example',
    description: 'Example experiment',
    models: ['gpt-5.5'],
    scenarios: ['example'],
    treatments: [],
  })}`
}

test('listExperiments derives namespaced IDs independently of the absolute root and module extension', async () => {
  const host = VirtualHost.create({
    '/first/experiments/example.ts': config(),
    '/second/experiments/example.cjs': config(),
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })

  for (const root of ['/first/experiments', '/second/experiments']) {
    const experiments = await listExperiments({
      host,
      experimentsDirectory: root,
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    })

    expect(
      experiments.map(experiment => {
        return experiment.id
      }),
    ).toEqual(['3429642046'])
  }
})

test('experiment plans restore pinned experiment and scenario IDs after resource renames', async () => {
  const host = VirtualHost.create({
    '/experiments/original.ts': config('pinned-experiment'),
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {id: "pinned-scenario", prompt: "Create a page"}',
  })
  const options = {
    host,
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  }
  const experiment = await getExperiment({...options, name: 'original'})
  const plan = createExperimentPlan({experiment})
  const manifest = createExperimentPlanManifest({experiment, plan})

  await host.fs.promises.rename('/experiments/original.ts', '/experiments/renamed.ts')
  await host.fs.promises.rename('/scenarios/example', '/scenarios/renamed')
  await host.fs.promises.writeFile(
    '/experiments/renamed.ts',
    config('pinned-experiment').replace('"scenarios":["example"]', '"scenarios":["renamed"]'),
  )
  const restored = await parseExperimentPlanManifest({...options, contents: JSON.stringify(manifest)})

  expect(restored.experiment.id).toBe('pinned-experiment')
  expect(restored.trials[0]!.scenario.id).toBe('pinned-scenario')
  expect(restored.trials[0]!.scenario.directory).toBe('/scenarios/renamed')
  expect((await getExperiment({...options, name: 'renamed'})).id).toBe('pinned-experiment')
})

test('listExperiments uses the same scenario ID for string and inline references', async () => {
  const host = VirtualHost.create({
    '/experiments/example.ts': `export default {
      name: "Example", description: "Example", models: [], treatments: [],
      scenarios: ["example", {path: "/scenarios/example", name: "alias"}],
    }`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })

  const experiments = await listExperiments({
    host,
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
  })
  const experiment = experiments[0]!

  expect(experiment.type).toBe('scenario')
  if (experiment.type === 'scenario') {
    expect(
      experiment.scenarios.map(scenario => {
        return scenario.id
      }),
    ).toEqual(['2770381665', '2770381665'])
  }
})

test('listExperiments rejects duplicate explicit IDs', async () => {
  const host = VirtualHost.create({
    '/experiments/first.ts': config('same'),
    '/experiments/second.ts': config('same'),
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })

  await expect(
    listExperiments({
      host,
      experimentsDirectory: '/experiments',
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Duplicate experiment ID: same')
})

test('getExperiment prioritizes resolved IDs over another resource filename', async () => {
  const host = VirtualHost.create({
    '/experiments/original.ts': config('other'),
    '/experiments/other.ts': config('different'),
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })

  const experiment = await getExperiment({
    host,
    experimentsDirectory: '/experiments',
    benchmarksDirectory: '/benchmarks',
    scenariosDirectory: '/scenarios',
    name: 'other',
  })

  expect(experiment.filepath).toBe('/experiments/original.ts')
})

test('listExperiments rejects an inline scenario ID that collides with a different referenced directory', async () => {
  const host = VirtualHost.create({
    '/experiments/example.ts': `export default {
      name: "Example", description: "Example", models: [], treatments: [],
      scenarios: ["example", {path: "/external/other"}],
    }`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {id: "same", prompt: "First"}',
    '/external/other/scenario.config.ts': 'export default {id: "same", prompt: "Second"}',
  })

  await expect(
    listExperiments({
      host,
      experimentsDirectory: '/experiments',
      benchmarksDirectory: '/benchmarks',
      scenariosDirectory: '/scenarios',
    }),
  ).rejects.toThrow('Duplicate scenario ID: same')
})

test.each(['', '   '])('experiment defineConfig rejects a blank explicit ID: %j', id => {
  expect(() => {
    return defineConfig({
      id,
      name: 'Example',
      description: 'Example experiment',
      models: [],
      scenarios: [],
      treatments: [],
    })
  }).toThrow()
})
