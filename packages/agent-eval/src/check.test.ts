import {expect, expectTypeOf, test} from 'vitest'
import {CheckOutputSchema, CheckRunSchema, parseCheckConfig, type CheckConfigRun, type CheckRunResult} from './check'
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

test.each(['single group', 'multiple groups'])('parsed checks preserve outcome annotations in %s', async shape => {
  const result = {
    id: 'tests',
    outcomes: [
      {type: 'outcome' as const, status: 'passed' as const, annotations: []},
      {type: 'outcome' as const, status: 'failed' as const, annotations: [{message: 'filters by name'}]},
      {
        type: 'outcome' as const,
        id: 'optional-case',
        status: 'skipped' as const,
        annotations: [
          {
            context: '/home/sandbox/workspace/scenario.test.ts',
            message: 'requires browser support',
            snippet: 'test.skip',
          },
          {message: 'Browser unavailable'},
        ],
      },
    ],
  }
  const run: CheckConfigRun = async () => {
    return shape === 'single group' ? result : [result]
  }
  const check = await parseCheckConfig(VirtualHost.create(), '/scenario', {name: 'tests', run})
  await using sandbox = await VirtualSandbox.create()

  await expect(check.run({logger, sandbox})).resolves.toEqual([{...result, type: 'outcomes'}])
})

test('parsed checks preserve measurement annotations', async () => {
  const result = {
    measurements: [
      {
        type: 'measurement' as const,
        value: 42,
        annotations: [{context: 'dist/index.js', message: 'Bundle size', snippet: 'export {}'}],
      },
      {type: 'measurement' as const, value: 0, annotations: []},
    ],
  }
  const run: CheckConfigRun = async () => result
  const check = await parseCheckConfig(VirtualHost.create(), '/scenario', {name: 'size', run})
  await using sandbox = await VirtualSandbox.create()

  await expect(check.run({logger, sandbox})).resolves.toEqual([{...result, type: 'measurements'}])
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

test.each([
  {name: 'non-array annotations', annotations: 'details'},
  {name: 'null annotations', annotations: null},
  {name: 'missing message', annotations: [{context: 'test.ts'}]},
  {name: 'invalid message', annotations: [{message: 123}]},
  {name: 'invalid context', annotations: [{message: 'details', context: 123}]},
  {name: 'invalid snippet', annotations: [{message: 'details', snippet: null}]},
])('check output rejects $name for outcomes and measurements', ({annotations}) => {
  for (const result of [
    {type: 'outcomes', outcomes: [{type: 'outcome', status: 'failed', annotations}]},
    {type: 'measurements', measurements: [{type: 'measurement', value: 42, annotations}]},
  ]) {
    expect(() => CheckOutputSchema.parse({check: {name: 'example', files: []}, result})).toThrow()
  }
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
