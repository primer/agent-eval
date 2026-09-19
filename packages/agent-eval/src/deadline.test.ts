import {afterEach, expect, test, vi} from 'vitest'
import {withDeadline} from './deadline'

afterEach(() => {
  vi.useRealTimers()
})

test('aborts the operation and rejects even when it ignores cancellation', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  const result = withDeadline(
    async received => {
      signal = received
      return new Promise<never>(() => {})
    },
    {timeoutMs: 100, description: 'Operation'},
  )
  const assertion = expect(result).rejects.toThrow('Operation exceeded its 100ms deadline')
  await vi.advanceTimersByTimeAsync(100)
  await assertion
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test('clears the timer after success or failure', async () => {
  vi.useFakeTimers()
  await expect(
    withDeadline(
      async () => {
        return 'done'
      },
      {timeoutMs: 100, description: 'Operation'},
    ),
  ).resolves.toBe('done')
  await expect(
    withDeadline(
      async () => {
        throw new Error('Failed')
      },
      {timeoutMs: 100, description: 'Operation'},
    ),
  ).rejects.toThrow('Failed')
  expect(vi.getTimerCount()).toBe(0)
})

test('propagates cancellation and does not start pre-aborted operations', async () => {
  const controller = new AbortController()
  const operation = vi.fn(async () => {
    return new Promise<never>(() => {})
  })
  const options = {timeoutMs: 100, description: 'Operation', signal: controller.signal}
  const result = withDeadline(operation, options)
  controller.abort(new Error('Cancelled'))
  await expect(result).rejects.toThrow('Cancelled')
  operation.mockClear()
  await expect(withDeadline(operation, options)).rejects.toThrow('Cancelled')
  expect(operation).not.toHaveBeenCalled()
})
