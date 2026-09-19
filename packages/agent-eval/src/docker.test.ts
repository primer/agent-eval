import Docker from 'dockerode'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {afterEach, expect, test, vi} from 'vitest'
import {createContainer, recoverContainers, removeContainer} from './docker'
import {containerLabels} from './container-ownership'

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

function containerInfo(id: string, labels: Record<string, string>): Docker.ContainerInfo {
  return {
    Id: id,
    Names: [],
    Image: 'example',
    ImageID: '',
    Command: 'sleep infinity',
    Created: 0,
    Ports: [],
    Labels: labels,
    State: 'running',
    Status: 'Up',
    HostConfig: {NetworkMode: 'default'},
    NetworkSettings: {Networks: {}},
    Mounts: [],
  }
}

test('recovery independently checks ownership and removes only inactive containers for the requested run', async () => {
  const runId = randomUUID()
  const labels = containerLabels(runId)
  vi.spyOn(Docker.prototype, 'listContainers').mockResolvedValue([
    containerInfo('owned', labels),
    containerInfo('foreign', {...labels, 'io.primer.agent-eval.owner': 'foreign'}),
    containerInfo('other-run', containerLabels(randomUUID())),
    containerInfo('live', {...labels, 'io.primer.agent-eval.pid': '123'}),
  ])
  vi.spyOn(process, 'kill').mockImplementation(pid => {
    if (pid === 123) {
      return true
    }
    throw Object.assign(new Error('Absent'), {code: 'ESRCH'})
  })
  const removed = new Docker().getContainer('owned')
  const getContainer = vi.spyOn(Docker.prototype, 'getContainer').mockReturnValue(removed)
  const remove = vi.spyOn(removed, 'remove').mockResolvedValue(undefined)
  expect(await recoverContainers(runId)).toEqual({removed: ['owned'], skipped: ['foreign', 'other-run', 'live']})
  expect(getContainer).toHaveBeenCalledExactlyOnceWith('owned')
  expect(remove).toHaveBeenCalledTimes(1)
})

test('adds ownership labels without allowing callers to override them', async () => {
  const container = new Docker().getContainer('labelled')
  const create = vi.spyOn(Docker.prototype, 'createContainer').mockResolvedValue(container)
  vi.spyOn(container, 'start').mockResolvedValue(undefined)
  vi.spyOn(container, 'remove').mockResolvedValue(undefined)
  const runId = randomUUID()
  await createContainer({
    image: {tagName: 'example'},
    runId,
    trialId: 'trial',
    Labels: {'io.primer.agent-eval.owner': 'override', custom: 'kept'},
  })
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      Labels: {...containerLabels(runId, 'trial'), custom: 'kept'},
    }),
  )
  await removeContainer(container)
})

test('reports recovery errors while continuing cleanup of other owned containers', async () => {
  const runId = randomUUID()
  vi.spyOn(Docker.prototype, 'listContainers').mockResolvedValue([
    containerInfo('failed', containerLabels(runId)),
    containerInfo('removed', containerLabels(runId)),
  ])
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('Absent'), {code: 'ESRCH'})
  })
  const failed = new Docker().getContainer('failed')
  const removed = new Docker().getContainer('removed')
  vi.spyOn(Docker.prototype, 'getContainer').mockReturnValueOnce(failed).mockReturnValueOnce(removed)
  vi.spyOn(failed, 'remove').mockRejectedValue(new Error('Docker error'))
  const remove = vi.spyOn(removed, 'remove').mockResolvedValue(undefined)
  await expect(recoverContainers(runId)).rejects.toThrow('Some containers could not be recovered')
  expect(remove).toHaveBeenCalledTimes(1)
})

test('aborts a real dockerode HTTP removal request when its deadline expires', async () => {
  const requested = Promise.withResolvers<void>()
  const disconnected = Promise.withResolvers<void>()
  const server = createServer(request => {
    request.socket.once('close', () => {
      disconnected.resolve()
    })
    requested.resolve()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected a local TCP listener')
    }
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    const container = new Docker({host: '127.0.0.1', port: address.port}).getContainer('stalled-http')
    const result = removeContainer(container)
    const assertion = expect(result).rejects.toThrow('exceeded its 30000ms deadline')
    await requested.promise
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    await disconnected.promise
  } finally {
    vi.useRealTimers()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }
})
