import {expect, test} from 'vitest'
import {CheckRunSchema} from './check'
import {logger} from './logger'
import {VirtualSandbox} from './sandbox'

test('check runs preserve a results array with a status for each file', async () => {
  const result = {
    type: 'outcomes' as const,
    results: [
      {type: 'outcome' as const, id: 'src/App.tsx', status: 'passed' as const},
      {type: 'outcome' as const, id: 'src/main.tsx', status: 'failed' as const},
    ],
  }
  const run = CheckRunSchema.parse(async () => {
    return result
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).resolves.toEqual(result)
})

test('check runs still accept outcomes without IDs', async () => {
  const result = {
    type: 'outcomes' as const,
    results: [{type: 'outcome' as const, status: 'passed' as const}],
  }
  const run = CheckRunSchema.parse(async () => {
    return result
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).resolves.toEqual(result)
})

test('check outcome IDs must be strings', async () => {
  const run = CheckRunSchema.parse(async () => {
    return {
      type: 'outcomes',
      results: [{type: 'outcome', id: 123, status: 'failed'}],
    }
  })
  await using sandbox = await VirtualSandbox.create()

  await expect(run({logger, sandbox})).rejects.toThrow()
})
