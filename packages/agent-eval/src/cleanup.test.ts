import {afterEach, expect, test, vi} from 'vitest'
import {SandboxCleanupQueue} from './cleanup'
import {VirtualHost} from './host'

afterEach(() => {
  vi.restoreAllMocks()
})

test('counts pending cleanup against the resource budget and resumes only after confirmed removal', async () => {
  const host = VirtualHost.create()
  const create = vi.fn(() => {
    return host.createSandbox()
  })
  const queue = new SandboxCleanupQueue(1)
  const first = await queue.create(create)
  const second = await queue.create(create)
  const removal = Promise.withResolvers<void>()
  vi.spyOn(first, Symbol.asyncDispose).mockReturnValue(removal.promise)
  const disposed = queue.dispose(first, 'first')
  const third = queue.create(create)
  expect(create).toHaveBeenCalledTimes(2)
  removal.resolve()
  expect(await disposed).toBe(true)
  await third
  expect(create).toHaveBeenCalledTimes(3)
  await queue.dispose(second, 'second')
  await queue.dispose(await third, 'third')
  await queue.drain()
  expect(queue.errors).toEqual([])
})

test('retries only cleanup and stops admission when resources remain unresolved', async () => {
  const host = VirtualHost.create()
  const create = vi.fn(() => {
    return host.createSandbox()
  })
  const queue = new SandboxCleanupQueue(1)
  const first = await queue.create(create)
  const second = await queue.create(create)
  const remove = vi.spyOn(first, Symbol.asyncDispose).mockRejectedValue(new Error('Docker unavailable'))
  const waiting = queue.create(create)
  const assertion = expect(waiting).rejects.toThrow('Container admission stopped')
  expect(await queue.dispose(first, 'first')).toBe(false)
  await assertion
  expect(remove).toHaveBeenCalledTimes(3)
  expect(create).toHaveBeenCalledTimes(2)
  await queue.dispose(second, 'second')
  await expect(queue.create(create)).rejects.toThrow('Container admission stopped')
  expect(queue.errors).toHaveLength(1)
})

test('recovers from a transient cleanup failure without recording a permanent error', async () => {
  const host = VirtualHost.create()
  const queue = new SandboxCleanupQueue(1)
  const sandbox = await queue.create(() => {
    return host.createSandbox()
  })
  const remove = vi
    .spyOn(sandbox, Symbol.asyncDispose)
    .mockRejectedValueOnce(new Error('Temporary error'))
    .mockResolvedValue(undefined)
  expect(await queue.dispose(sandbox, 'trial')).toBe(true)
  expect(remove).toHaveBeenCalledTimes(2)
  expect(queue.errors).toEqual([])
})

test('does not allocate more resources after uncertain container creation', async () => {
  const queue = new SandboxCleanupQueue(1)
  const create = vi.fn(async () => {
    throw new Error('Container start and removal failed')
  })
  await expect(queue.create(create)).rejects.toThrow('Container creation failed')
  await expect(queue.create(create)).rejects.toThrow('Container admission stopped')
  expect(create).toHaveBeenCalledTimes(1)
})
