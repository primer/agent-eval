import path from 'node:path'
import {describe, expect, test} from 'vitest'
import {
  getBenchmark,
  getBenchmarkByName,
  getExperiment,
  getExperimentByName,
  getScenario,
  getScenarioByName,
  listBenchmarks,
  listExperiments,
  listScenarios,
} from './index'
import {getBenchmarkByReference} from './benchmark/get'
import {getExperimentByReference} from './experiment/get'
import {getScenarioByReference} from './scenario/get'
import {hash} from './hash'
import {VirtualHost} from './host'

function createOptions() {
  const host = VirtualHost.create({
    '/benchmarks/baseline.ts': `export default {
      name: 'Baseline',
      description: 'Baseline',
      models: ['gpt-5.5'],
      capabilities: [{name: 'Components', scenarios: ['task']}],
    }`,
    '/experiments/comparison.ts': `export default {
      name: 'Comparison',
      description: 'Comparison',
      models: ['gpt-5.5'],
      benchmark: 'baseline',
      treatments: [],
    }`,
    '/scenarios/task/package.json': '{}',
    '/scenarios/task/scenario.config.ts': 'export default {name: "Task", prompt: "Create a page"}',
  })
  return {
    host,
    benchmarksDirectory: '/benchmarks',
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
    directory: '/scenarios',
  }
}

describe.each([
  {
    kind: 'Benchmark',
    alias: 'baseline',
    name: 'Baseline',
    get: getBenchmark,
    byName: getBenchmarkByName,
    byReference: getBenchmarkByReference,
    list: listBenchmarks,
    filepath: '/benchmarks/baseline.ts',
  },
  {
    kind: 'Experiment',
    alias: 'comparison',
    name: 'Comparison',
    get: getExperiment,
    byName: getExperimentByName,
    byReference: getExperimentByReference,
    list: listExperiments,
    filepath: '/experiments/comparison.ts',
  },
  {
    kind: 'Scenario',
    alias: 'task',
    name: 'Task',
    get: getScenario,
    byName: getScenarioByName,
    byReference: getScenarioByReference,
    list: listScenarios,
    filepath: '/scenarios/task/scenario.config.ts',
  },
])('$kind identity and lookup', ({kind, alias, name, get, byName, byReference, list, filepath}) => {
  test('lists namespaced hashed IDs and resolves the same resource by ID or display name', async () => {
    const options = createOptions()
    const id = hash(`${kind}:${alias}`)

    expect(await list(options)).toMatchObject([{id, name}])
    expect(await get({...options, id})).toMatchObject({id, name})
    expect(await byName({...options, name})).toMatchObject({id, name})
  })

  test('does not treat a name or filename alias as an ID', async () => {
    const options = createOptions()

    for (const id of [name, alias]) {
      await expect(get({...options, id})).rejects.toThrow(`${kind} "${id}" was not found`)
    }
  })

  test('does not treat an ID or filename alias as a display name', async () => {
    const options = createOptions()

    for (const identifier of [hash(`${kind}:${alias}`), alias]) {
      await expect(byName({...options, name: identifier})).rejects.toThrow(`${kind} "${identifier}" was not found`)
    }
  })

  test('resolves CLI and configuration references by ID, name, or filename alias', async () => {
    const options = createOptions()
    const id = hash(`${kind}:${alias}`)

    for (const reference of [id, name, alias]) {
      expect(await byReference({...options, reference})).toMatchObject({id, name})
    }
  })

  test('keeps IDs stable when display names change', async () => {
    const options = createOptions()
    const id = hash(`${kind}:${alias}`)
    const config = await options.host.fs.promises.readFile(filepath, 'utf8')
    await options.host.fs.promises.writeFile(filepath, config.replaceAll(name, 'Renamed'))

    expect(await get({...options, id})).toMatchObject({id, name: 'Renamed'})
    expect(await byName({...options, name: 'Renamed'})).toMatchObject({id, name: 'Renamed'})
    await expect(byName({...options, name})).rejects.toThrow(`${kind} "${name}" was not found`)
  })

  test('changes IDs when the resource file or directory is renamed', async () => {
    const options = createOptions()
    const source = kind === 'Scenario' ? path.dirname(filepath) : filepath
    await options.host.fs.promises.rename(source, source.replace(alias, 'renamed'))

    expect(await get({...options, id: hash(`${kind}:renamed`)})).toMatchObject({name})
    await expect(get({...options, id: hash(`${kind}:${alias}`)})).rejects.toThrow('was not found')
  })

  test('rejects ambiguous display names while allowing unambiguous ID lookup', async () => {
    const options = createOptions()
    const duplicate = filepath.replace(alias, 'duplicate')
    await options.host.fs.promises.mkdir(path.dirname(duplicate), {recursive: true})
    await options.host.fs.promises.writeFile(duplicate, await options.host.fs.promises.readFile(filepath, 'utf8'))
    if (kind === 'Scenario') {
      await options.host.fs.promises.writeFile('/scenarios/duplicate/package.json', '{}')
    }

    await expect(byName({...options, name})).rejects.toThrow(`${kind} "${name}" is ambiguous`)
    await expect(byReference({...options, reference: name})).rejects.toThrow(`${kind} "${name}" is ambiguous`)
    expect(await get({...options, id: hash(`${kind}:${alias}`)})).toMatchObject({name})
  })
})

test('listExperiments resolves hashed configuration references and preserves inline scenario names', async () => {
  const options = createOptions()
  await options.host.fs.promises.writeFile(
    '/experiments/comparison.ts',
    `export default {
      name: 'Comparison',
      description: 'Comparison',
      models: ['gpt-5.5'],
      benchmark: '${hash('Benchmark:baseline')}',
      treatments: [],
    }`,
  )
  await options.host.fs.promises.writeFile(
    '/benchmarks/baseline.ts',
    `export default {
      name: 'Baseline',
      description: 'Baseline',
      models: ['gpt-5.5'],
      capabilities: [{
        name: 'Components',
        scenarios: [
          '${hash('Scenario:task')}',
          {path: '/scenarios/task', name: 'Inline task'},
        ],
      }],
    }`,
  )

  const experiment = await getExperimentByName({...options, name: 'Comparison'})

  expect(experiment).toMatchObject({
    type: 'benchmark',
    benchmark: {
      id: hash('Benchmark:baseline'),
      capabilities: [
        {
          scenarios: [
            {id: hash('Scenario:task'), name: 'Task'},
            {id: hash('Scenario:task'), name: 'Inline task'},
          ],
        },
      ],
    },
  })
})
