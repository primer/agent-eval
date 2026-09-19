import Docker from 'dockerode'
import {afterEach, expect, test, vi} from 'vitest'
import {createContainer, removeContainer} from './docker'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('bounds container removal and aborts the Docker request', async () => {
  vi.useFakeTimers()
  const container = new Docker().getContainer('stalled')
  const remove = vi.spyOn(container, 'remove').mockImplementation(async () => {
    return new Promise<never>(() => {})
  })
  const result = removeContainer(container)
  const assertion = expect(result).rejects.toThrow('Removing container "stalled" exceeded its 30000ms deadline')
  await vi.advanceTimersByTimeAsync(30_000)
  await assertion
  expect(remove).toHaveBeenCalledWith({force: true, abortSignal: expect.any(AbortSignal)})
  const options = remove.mock.calls[0][0]
  expect(
    options && 'abortSignal' in options && options.abortSignal instanceof AbortSignal && options.abortSignal.aborted,
  ).toBe(true)
})

test('bounds cleanup when starting a container fails', async () => {
  vi.useFakeTimers()
  const container = new Docker().getContainer('failed-start')
  vi.spyOn(Docker.prototype, 'createContainer').mockResolvedValue(container)
  vi.spyOn(container, 'start').mockRejectedValue(new Error('Start failed'))
  vi.spyOn(container, 'remove').mockImplementation(async () => {
    return new Promise<never>(() => {})
  })
  const result = createContainer({image: {tagName: 'example'}})
  const assertion = expect(result).rejects.toThrow('Failed to initialize and remove container')
  await vi.advanceTimersByTimeAsync(30_000)
  await assertion
  vi.mocked(container.remove).mockResolvedValue(undefined)
  await removeContainer(container)
})

test('treats an already absent container as successfully removed', async () => {
  const container = new Docker().getContainer('missing')
  const remove = vi.spyOn(container, 'remove').mockRejectedValue(Object.assign(new Error('Missing'), {statusCode: 404}))
  await removeContainer(container)
  await removeContainer(container)
  expect(remove).toHaveBeenCalledTimes(1)
})

test('retries unresolved removal and only deduplicates confirmed removal', async () => {
  const container = new Docker().getContainer('retry')
  const remove = vi
    .spyOn(container, 'remove')
    .mockRejectedValueOnce(new Error('Docker unavailable'))
    .mockResolvedValue(undefined)
  await expect(removeContainer(container)).rejects.toThrow('Docker unavailable')
  await removeContainer(container)
  await removeContainer(container)
  expect(remove).toHaveBeenCalledTimes(2)
})

test('shares an in-flight removal request between concurrent callers', async () => {
  const container = new Docker().getContainer('concurrent')
  const deferred = Promise.withResolvers<void>()
  const remove = vi.spyOn(container, 'remove').mockReturnValue(deferred.promise)
  const first = removeContainer(container)
  const second = removeContainer(container)
  expect(remove).toHaveBeenCalledTimes(1)
  deferred.resolve()
  await Promise.all([first, second])
  await removeContainer(container)
  expect(remove).toHaveBeenCalledTimes(1)
})

test('keeps unresolved containers registered for signal cleanup', async () => {
  const container = new Docker().getContainer('tracked')
  vi.spyOn(Docker.prototype, 'createContainer').mockResolvedValue(container)
  vi.spyOn(container, 'start').mockResolvedValue(undefined)
  const remove = vi.spyOn(container, 'remove').mockRejectedValue(new Error('Docker unavailable'))
  const listeners = process.listenerCount('SIGTERM')
  await createContainer({image: {tagName: 'example'}})
  expect(process.listenerCount('SIGTERM')).toBe(listeners + 1)
  await expect(removeContainer(container)).rejects.toThrow('Docker unavailable')
  expect(process.listenerCount('SIGTERM')).toBe(listeners + 1)
  remove.mockResolvedValue(undefined)
  await removeContainer(container)
  expect(process.listenerCount('SIGTERM')).toBe(listeners)
})
