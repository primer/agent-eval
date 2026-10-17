import {expect, expectTypeOf, test} from 'vitest'
import {CheckOutputSchema, CheckRunSchema, parseCheckConfig, type CheckRunResult} from './check'
import {VirtualHost} from './host'
import {logger} from './logger'
import {VirtualSandbox} from './sandbox'

test('check runs preserve an outcomes array with a status for each file', async () => {
  const result = {
    type: 'outcomes' as const,
    outcomes: [
      {type: 'outcome' as const, id: 'src/App.tsx', status: 'passed' as const},
      {type: 'outcome' as const, id: 'src/main.tsx', status: 'failed' as const},
    ],
  }
  const run = CheckRunSchema.parse(async () => {
    return [result]
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).resolves.toEqual([result])
})

test('check runs still accept outcomes without IDs', async () => {
  const result = {
    type: 'outcomes' as const,
    outcomes: [{type: 'outcome' as const, status: 'passed' as const}],
  }
  const run = CheckRunSchema.parse(async () => {
    return [result]
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).resolves.toEqual([result])
})

test('check outcome IDs must be strings', async () => {
  const run = CheckRunSchema.parse(async () => {
    return [
      {
        type: 'outcomes',
        outcomes: [{type: 'outcome', id: 123, status: 'failed'}],
      },
    ]
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).rejects.toThrow()
})

test('runtime check runs require an array of result groups', async () => {
  const run = CheckRunSchema.parse(async () => {
    return {type: 'outcomes', outcomes: []}
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).rejects.toThrow()
})

test.each([
  {type: 'outcomes', results: []},
  {type: 'measurements', results: []},
  {type: 'outcomes', measurements: []},
  {type: 'measurements', outcomes: []},
])('runtime check runs reject mismatched result fields: %j', async result => {
  const run = CheckRunSchema.parse(async () => {
    return [result]
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).rejects.toThrow()
})

test.each([
  {type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed'}]},
  {type: 'measurements', measurements: [{type: 'measurement', value: 42}], unit: 'ms'},
])('check output preserves type-specific result fields: %j', result => {
  const output = {
    check: {name: 'example', files: []},
    result,
  }

  expect(CheckOutputSchema.parse(output)).toEqual(output)
})

test.each([
  {
    input: {
      id: 'lint',
      outcomes: [
        {type: 'outcome', id: 'src/App.tsx', status: 'passed'},
        {type: 'outcome', id: 'src/main.tsx', status: 'failed'},
        {type: 'outcome', status: 'skipped'},
        {type: 'error', message: 'Could not check file'},
      ],
    },
    expected: [
      {
        type: 'outcomes',
        id: 'lint',
        outcomes: [
          {type: 'outcome', id: 'src/App.tsx', status: 'passed'},
          {type: 'outcome', id: 'src/main.tsx', status: 'failed'},
          {type: 'outcome', status: 'skipped'},
          {type: 'error', message: 'Could not check file'},
        ],
      },
    ],
  },
  {
    input: {
      id: 'latency',
      unit: 'ms',
      direction: 'lower-is-better',
      measurements: [
        {type: 'measurement', value: 42},
        {type: 'error', message: 'Timed out'},
      ],
    },
    expected: [
      {
        type: 'measurements',
        id: 'latency',
        unit: 'ms',
        direction: 'lower-is-better',
        measurements: [
          {type: 'measurement', value: 42},
          {type: 'error', message: 'Timed out'},
        ],
      },
    ],
  },
  {input: {outcomes: []}, expected: [{type: 'outcomes', outcomes: []}]},
  {input: {measurements: []}, expected: [{type: 'measurements', measurements: []}]},
  {
    input: {outcomes: [{type: 'outcome', status: 'passed'}]},
    expected: [{type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed'}]}],
  },
  {
    input: [{id: 'tests', outcomes: []}],
    expected: [{type: 'outcomes', id: 'tests', outcomes: []}],
  },
  {
    input: [
      {id: 'tests', outcomes: [{type: 'outcome', status: 'passed'}]},
      {id: 'score', measurements: [{type: 'measurement', value: 0}], direction: 'higher-is-better'},
    ],
    expected: [
      {type: 'outcomes', id: 'tests', outcomes: [{type: 'outcome', status: 'passed'}]},
      {
        type: 'measurements',
        id: 'score',
        measurements: [{type: 'measurement', value: 0}],
        direction: 'higher-is-better',
      },
    ],
  },
  {input: [], expected: []},
])('parsed checks normalize $input', async ({input, expected}) => {
  const check = await parseCheckConfig(VirtualHost.create(), '/scenario', {
    name: 'example',
    async run() {
      return input
    },
  })
  await using sandbox = await VirtualSandbox.create()

  expectTypeOf<Awaited<ReturnType<typeof check.run>>>().toEqualTypeOf<Array<CheckRunResult>>()
  await expect(check.run({logger, sandbox})).resolves.toEqual(expected)
})

test.each([
  {},
  {outcomes: [], measurements: []},
  {type: 'outcomes', results: []},
  {type: 'measurements', results: []},
  {outcomes: [{type: 'outcome', id: 123, status: 'failed'}]},
  {outcomes: [{type: 'outcome', status: 'invalid'}]},
  {measurements: [{type: 'measurement', value: '42'}]},
  {measurements: [], direction: 'invalid'},
  {outcomes: [{type: 'measurement', value: 42}]},
  {measurements: [{type: 'outcome', status: 'passed'}]},
  {outcomes: [{type: 'error', message: 123}]},
  [{outcomes: []}],
  [{measurements: []}],
  [{id: 123, outcomes: []}],
])('parsed checks reject invalid results: %j', async result => {
  const check = await parseCheckConfig(VirtualHost.create(), '/scenario', {
    name: 'example',
    async run() {
      return result
    },
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(check.run({logger, sandbox})).rejects.toThrow()
})

test('parsed checks preserve callback arguments and errors', async () => {
  const error = new Error('Check failed')
  await using sandbox = await VirtualSandbox.create()
  const check = await parseCheckConfig(VirtualHost.create(), '/scenario', {
    name: 'example',
    async run(input: {logger: typeof logger; sandbox: typeof sandbox}) {
      expect(input.logger).toBe(logger)
      expect(input.sandbox).toBe(sandbox)
      throw error
    },
  })

  await expect(check.run({logger, sandbox})).rejects.toBe(error)
})
