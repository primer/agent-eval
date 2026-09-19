import {randomUUID} from 'node:crypto'
import {PassThrough} from 'node:stream'
import Docker from 'dockerode'
import {afterEach, expect, test, vi} from 'vitest'
import {createContainer, exec, removeContainer, type RunningContainer} from './docker'
import {VirtualHost} from './host'
import {SystemSandbox} from './sandbox/system'

const containers: Array<RunningContainer> = []
afterEach(async () => {
  for (const container of containers) {
    vi.mocked(container.remove).mockResolvedValue(undefined)
    await removeContainer(container)
  }
  containers.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function setup() {
  const client = new Docker()
  const created = client.getContainer(randomUUID())
  vi.spyOn(Docker.prototype, 'createContainer').mockResolvedValue(created)
  vi.spyOn(created, 'start').mockResolvedValue(undefined)
  const remove = vi.spyOn(created, 'remove').mockResolvedValue(undefined)
  const container = await createContainer({image: {tagName: 'example'}})
  containers.push(container)
  const command = client.getExec('command')
  const createExec = vi.spyOn(container, 'exec').mockResolvedValue(command)
  const stream = new PassThrough()
  const ready = Promise.withResolvers<void>()
  stream.on('newListener', event => {
    if (event === 'data') {
      ready.resolve()
    }
  })
  const start = vi.spyOn(command, 'start').mockResolvedValue(stream)
  const info: Docker.ExecInspectInfo = {
    ID: 'command',
    Running: false,
    ExitCode: 0,
    ContainerID: container.id,
    OpenStdin: false,
    OpenStdout: true,
    OpenStderr: true,
    ProcessConfig: {privileged: false, user: 'node', tty: false, entrypoint: 'test', arguments: []},
    CanRemove: false,
    DetachKeys: '',
    Pid: 1,
  }
  const inspect = vi.spyOn(command, 'inspect').mockResolvedValue(info)
  return {container, command, stream, createExec, start, inspect, info, remove, ready: ready.promise}
}

function frame(channel: 1 | 2, text: string): Buffer {
  const contents = Buffer.from(text)
  const header = Buffer.alloc(8)
  header[0] = channel
  header.writeUInt32BE(contents.length, 4)
  return Buffer.concat([header, contents])
}

test('captures multiplexed output and preserves nonzero exit codes', async () => {
  const {container, stream, inspect, info, ready, remove} = await setup()
  inspect.mockResolvedValue({...info, ExitCode: 7})
  const result = exec({container, Cmd: ['test']})
  await ready
  stream.end(Buffer.concat([frame(1, 'stdout'), frame(2, 'stderr')]))
  await expect(result).resolves.toEqual({stdout: 'stdout', stderr: 'stderr', exitCode: 7})
  expect(remove).not.toHaveBeenCalled()
  expect(stream.destroyed).toBe(true)
})

test('rejects premature close instead of waiting forever', async () => {
  const {container, stream, ready, remove} = await setup()
  const result = exec({container})
  const assertion = expect(result).rejects.toThrow('Premature close')
  await ready
  stream.destroy()
  await assertion
  expect(remove).toHaveBeenCalledTimes(1)
  await expect(exec({container})).rejects.toThrow('no longer available')
})

test('propagates stream errors and removes the uncertain container', async () => {
  const {container, stream, ready, remove} = await setup()
  const result = exec({container})
  const assertion = expect(result).rejects.toThrow('Connection lost')
  await ready
  stream.destroy(new Error('Connection lost'))
  await assertion
  expect(remove).toHaveBeenCalledTimes(1)
})

test.each(['create', 'start', 'stream', 'inspect'] as const)(
  'bounds the complete exec lifecycle when %s stalls',
  async phase => {
    vi.useFakeTimers()
    const {container, createExec, start, inspect, stream, remove} = await setup()
    const never = new Promise<never>(() => {})
    if (phase === 'create') {
      createExec.mockReturnValue(never)
    } else if (phase === 'start') {
      start.mockReturnValue(never)
    } else if (phase === 'inspect') {
      inspect.mockReturnValue(never)
      stream.end()
    }
    const result = exec({container, timeoutMs: 100})
    const assertion = expect(result).rejects.toThrow('exceeded its 100ms deadline')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(remove).toHaveBeenCalledTimes(1)
    await expect(exec({container})).rejects.toThrow('no longer available')
    const signal = createExec.mock.calls[0][0].abortSignal
    expect(signal?.aborted).toBe(true)
    if (phase === 'stream') {
      expect(stream.destroyed).toBe(true)
    }
  },
)

test('destroys a stream that arrives after the command deadline', async () => {
  vi.useFakeTimers()
  const {container, stream, start} = await setup()
  const pending = Promise.withResolvers<PassThrough>()
  start.mockReturnValue(pending.promise)
  const result = exec({container, timeoutMs: 100})
  const assertion = expect(result).rejects.toThrow('exceeded its 100ms deadline')
  await vi.advanceTimersByTimeAsync(100)
  await assertion
  pending.resolve(stream)
  await vi.advanceTimersByTimeAsync(0)
  expect(stream.destroyed).toBe(true)
})

test('propagates cancellation and closes the attached stream', async () => {
  const {container, stream, ready, remove} = await setup()
  const controller = new AbortController()
  const result = exec({container, abortSignal: controller.signal})
  const assertion = expect(result).rejects.toThrow('Cancelled')
  await ready
  controller.abort(new Error('Cancelled'))
  await assertion
  expect(stream.destroyed).toBe(true)
  expect(remove).toHaveBeenCalledTimes(1)
})

test('does not start or retire the container for pre-aborted or invalid options', async () => {
  const {container, createExec, remove} = await setup()
  await expect(exec({container, abortSignal: AbortSignal.abort(new Error('Cancelled'))})).rejects.toThrow('Cancelled')
  for (const timeoutMs of [0, -1, NaN, Infinity, 2 ** 31, 0.5]) {
    await expect(exec({container, timeoutMs})).rejects.toThrow()
  }
  expect(createExec).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})

test('waits for the exit status if EOF arrives before the process is reaped', async () => {
  vi.useFakeTimers()
  const {container, stream, inspect, info} = await setup()
  inspect.mockResolvedValueOnce({...info, Running: true})
  stream.end()
  const result = exec({container, timeoutMs: 100})
  await vi.advanceTimersByTimeAsync(25)
  await expect(result).resolves.toEqual({stdout: '', stderr: '', exitCode: 0})
  expect(inspect).toHaveBeenCalledTimes(2)
})

test.each(['{"Running":false,"ExitCode":null}', '{"Running":false}', '{"ExitCode":0}'])(
  'does not turn invalid exit status into success: %s',
  async json => {
    const {container, stream, inspect} = await setup()
    inspect.mockResolvedValue(JSON.parse(json))
    stream.end()
    await expect(exec({container})).rejects.toThrow()
  },
)

test('applies the default one-hour deadline', async () => {
  vi.useFakeTimers()
  const {container} = await setup()
  const result = exec({container})
  const assertion = expect(result).rejects.toThrow('exceeded its 3600000ms deadline')
  await vi.advanceTimersByTimeAsync(3_600_000)
  await assertion
})

test('bounds waiting for a process that keeps running after EOF', async () => {
  vi.useFakeTimers()
  const {container, stream, inspect, info} = await setup()
  inspect.mockResolvedValue({...info, Running: true})
  stream.end()
  const result = exec({container, timeoutMs: 100})
  const assertion = expect(result).rejects.toThrow('exceeded its 100ms deadline')
  await vi.advanceTimersByTimeAsync(100)
  await assertion
})

test('enforces timeoutMs and signal passed through sandbox.runCommand', async () => {
  vi.useFakeTimers()
  const {container, stream, ready} = await setup()
  const sandbox = new SystemSandbox(VirtualHost.create(), container)
  const result = sandbox.runCommand('test', [], {timeoutMs: 100})
  const assertion = expect(result).rejects.toThrow('exceeded its 100ms deadline')
  await ready
  await vi.advanceTimersByTimeAsync(100)
  await assertion
  expect(stream.destroyed).toBe(true)
})

test('forwards public sandbox deadlines and cancellation without masking nonzero exits', async () => {
  vi.useFakeTimers()
  const {container, stream, info, inspect, ready, createExec} = await setup()
  const sandbox = new SystemSandbox(VirtualHost.create(), container)
  const controller = new AbortController()
  inspect.mockResolvedValue({...info, ExitCode: 2})
  const result = sandbox.runCommand('test', [], {
    timeoutMs: 100,
    signal: controller.signal,
    allowNonZeroExitCode: true,
  })
  await ready
  stream.end()
  await expect(result).resolves.toEqual({stdout: '', stderr: '', exitCode: 2})
  expect(createExec).toHaveBeenCalledWith(
    expect.objectContaining({Cmd: ['test'], abortSignal: expect.any(AbortSignal)}),
  )
  expect(vi.getTimerCount()).toBe(0)
})
