import {describe, expect, test} from 'vitest'
import {parseCloudTask, runCloudTask, type Gh} from './copilot-cloud'

const id = '12345678-1234-4123-8123-123456789abc'
const url = `https://github.com/owner/repo/pull/42/agent-sessions/${id}`
const collect = parseCloudTask({type: 'collect', repository: 'owner/repo', session: id})
const submit = parseCloudTask({type: 'submit', repository: 'owner/repo', base: 'main', prompt: 'Build a button'})

function session(state = 'completed', overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id,
    state,
    repository: 'owner/repo',
    pullRequestNumber: 42,
    pullRequestUrl: 'https://github.com/owner/repo/pull/42',
    createdAt: '2026-10-22T12:00:00Z',
    completedAt: state === 'completed' ? '2026-10-22T12:05:00Z' : null,
    ...overrides,
  })
}

function artifacts() {
  const files = new Map<string, string>()
  return {
    files,
    async save(name: string, content: string) {
      files.set(name, content)
    },
  }
}

function commandQueue(responses: Array<string | Error>) {
  const calls: Array<{args: Array<string>; input: string | undefined}> = []
  const gh: Gh = async (args, {input, signal}) => {
    signal.throwIfAborted()
    calls.push({args, input})
    const response = responses.shift()
    if (response === undefined) throw new Error('Unexpected command')
    if (response instanceof Error) throw response
    return response
  }
  return {gh, calls}
}

const snapshot = JSON.stringify({baseRefOid: 'a'.repeat(40), headRefOid: 'b'.repeat(40)})

describe('parseCloudTask', () => {
  test('parses explicit submission separately from read-only collection', () => {
    expect(submit).toEqual({type: 'submit', repository: 'owner/repo', base: 'main', prompt: 'Build a button'})
    expect(collect).toEqual({type: 'collect', repository: 'owner/repo', session: id})
  })

  test.each([
    {type: 'submit', repository: 'owner/repo', base: 'main', prompt: ' '},
    {type: 'submit', repository: 'owner/repo', base: '', prompt: 'Task'},
    {type: 'collect', repository: '--host/evil', session: id},
    {type: 'collect', repository: 'github.com/owner/repo', session: id},
    {type: 'collect', repository: 'owner/repo', session: '42'},
  ])('rejects incomplete or ambiguous input: %j', input => {
    expect(() => parseCloudTask(input)).toThrow()
  })
})

describe('runCloudTask', () => {
  test('submits once via stdin and collects session evidence and an immutable PR diff', async () => {
    const {gh, calls} = commandQueue(['help', `${url}\n`, session(), 'logs', snapshot, 'diff'])
    const {save, files} = artifacts()

    const result = await runCloudTask(submit, {gh, save, signal: new AbortController().signal})

    expect(result.state).toBe('completed')
    expect(calls[1]).toEqual({
      args: ['agent-task', 'create', '--repo', 'owner/repo', '--base', 'main', '--from-file', '-'],
      input: 'Build a button',
    })
    expect(calls[5]?.args).toEqual([
      'api',
      `repos/owner/repo/compare/${'a'.repeat(40)}...${'b'.repeat(40)}`,
      '--header',
      'Accept: application/vnd.github.diff',
    ])
    expect(JSON.parse(files.get('task.json')!)).toEqual({repository: 'owner/repo', session: id})
    expect(files.get('session.log')).toBe('logs')
    expect(files.get('changes.diff')).toBe('diff')
  })

  test('resumes by session UUID without creating a task and polls active states', async () => {
    const {gh, calls} = commandQueue([
      session('queued', {repository: null, pullRequestNumber: null, pullRequestUrl: null}),
      session('in_progress'),
      session(),
      'logs',
      snapshot,
      'diff',
    ])
    const {save} = artifacts()

    await runCloudTask(collect, {gh, save, signal: new AbortController().signal, pollIntervalMs: 0})

    expect(calls.some(call => call.args.includes('create'))).toBe(false)
    expect(calls[0]?.args).toContain(id)
  })

  test.each(['failed', 'cancelled', 'timed_out', 'idle', 'waiting_for_user'])(
    'collects diagnostics but does not report success for %s',
    async state => {
      const {gh} = commandQueue([session(state), 'logs', snapshot, 'diff'])
      const {save, files} = artifacts()

      await expect(runCloudTask(collect, {gh, save, signal: new AbortController().signal})).rejects.toThrow(
        `ended with state: ${state}`,
      )

      expect(files.get('session.log')).toBe('logs')
      expect(files.get('session.json')).toBe(session(state))
    },
  )

  test.each([
    'job job-id queued. View progress: https://github.com/copilot/agents\n',
    'https://github.com/owner/repo/pull/42\n',
    `https://github.com/other/repo/pull/42/agent-sessions/${id}\n`,
  ])('preserves an unidentified submission without retrying: %s', output => {
    const {gh, calls} = commandQueue(['help', output])
    const {save, files} = artifacts()

    return expect(runCloudTask(submit, {gh, save, signal: new AbortController().signal}))
      .rejects.toThrow('do not resubmit automatically')
      .then(() => {
        expect(files.get('submission.txt')).toBe(output)
        expect(calls.filter(call => call.args.includes('--from-file'))).toHaveLength(1)
      })
  })

  test.each([
    {id: '12345678-1234-4123-8123-123456789abd'},
    {repository: 'other/repo'},
    {pullRequestUrl: 'https://github.com/other/repo/pull/42'},
    {state: 'new_unknown_state'},
  ])('preserves raw metadata and rejects unexpected session data: %j', overrides => {
    const raw = session('completed', overrides)
    const {gh} = commandQueue([raw])
    const {save, files} = artifacts()

    return expect(runCloudTask(collect, {gh, save, signal: new AbortController().signal}))
      .rejects.toThrow()
      .then(() => {
        expect(files.get('session.json')).toBe(raw)
      })
  })

  test('retains the session identity when log collection fails', async () => {
    const {gh} = commandQueue([session(), new Error('Log download failed')])
    const {save, files} = artifacts()

    await expect(runCloudTask(collect, {gh, save, signal: new AbortController().signal})).rejects.toThrow(
      'Log download failed',
    )

    expect(files.has('task.json')).toBe(true)
    expect(files.has('session.json')).toBe(true)
  })

  test('does not submit after cancellation', async () => {
    const controller = new AbortController()
    controller.abort(new Error('Stopped'))
    const {gh, calls} = commandQueue([])
    const {save} = artifacts()

    await expect(runCloudTask(submit, {gh, save, signal: controller.signal})).rejects.toThrow('Stopped')
    expect(calls).toEqual([])
  })

  test('cancels active polling and preserves the resumable task identity', async () => {
    const controller = new AbortController()
    const {save, files} = artifacts()
    const gh: Gh = async () => {
      controller.abort()
      return session('in_progress')
    }

    await expect(runCloudTask(collect, {gh, save, signal: controller.signal})).rejects.toThrow()

    expect(files.has('task.json')).toBe(true)
    expect(files.get('session.json')).toBe(session('in_progress'))
  })
})
