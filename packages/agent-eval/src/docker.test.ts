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
})

test('treats an already absent container as successfully removed', async () => {
  const container = new Docker().getContainer('missing')
  const remove = vi.spyOn(container, 'remove').mockRejectedValue(Object.assign(new Error('Missing'), {statusCode: 404}))
  await removeContainer(container)
  await removeContainer(container)
  expect(remove).toHaveBeenCalledTimes(1)
})
