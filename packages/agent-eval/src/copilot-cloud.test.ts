import {describe, expect, test} from 'vitest'
import {
  cloudPrompt,
  downloadCloudResults,
  parseCloudRequest,
  resolveCloudRequest,
  parseCloudTask,
  preflightRelease,
  runCloudTask,
  type Gh,
} from './copilot-cloud'

const id = '12345678-1234-4123-8123-123456789abc'
const request = parseCloudRequest({
  repository: 'owner/repo',
  runId: id,
  kind: 'scenario',
  name: '001-example',
  release: 'cloud-results',
  releaseId: 123,
  commit: 'a'.repeat(40),
  tree: 'd'.repeat(40),
  deadline: '2099-10-22T12:00:00.000Z',
  exportBundle: true,
})
const collect = parseCloudTask({type: 'collect', request, session: id})
const submit = parseCloudTask({type: 'submit', request, base: 'main'})
const execution = {
  request,
  state: 'succeeded',
  exitCode: 0,
  sourceCommit: request.commit,
  sourceTree: request.tree,
  output: {sha256: 'b'.repeat(64), trialCount: 1},
}
const privateRepo = JSON.stringify({isPrivate: true, nameWithOwner: request.repository})
const draft = JSON.stringify({isDraft: true, tagName: request.release, databaseId: request.releaseId})
const signal = () => new AbortController().signal

function session(state = 'completed', overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id,
    state,
    repository: 'owner/repo',
    pullRequestNumber: 42,
    pullRequestUrl: 'https://github.com/owner/repo/pull/42',
    createdAt: null,
    completedAt: null,
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
  const gh: Gh = async (args, {input, signal: commandSignal}) => {
    commandSignal.throwIfAborted()
    calls.push({args, input})
    const response = responses.shift()
    if (response === undefined) throw new Error('Unexpected command')
    if (response instanceof Error) throw response
    return response
  }
  return {gh, calls}
}
const download = async () => execution

describe('parseCloudTask', () => {
  test('binds collection to the complete original evaluation request', () => {
    expect(collect).toEqual({type: 'collect', request, session: id})
  })
  test.each([
    {kind: 'shell'},
    {name: '../escape'},
    {name: '--token'},
    {name: 'x; touch file'},
    {repository: '--host/evil'},
    {release: '../release'},
    {runId: '42'},
    {commit: 'main'},
    {tree: 'main'},
    {deadline: 'later'},
    {exportBundle: 'true'},
  ])('rejects malformed requests: %j', override => {
    expect(() => parseCloudRequest({...request, ...override})).toThrow()
  })
  test('does not accept the former arbitrary prompt submission', () => {
    expect(() => parseCloudTask({type: 'submit', repository: 'owner/repo', base: 'main', prompt: 'anything'})).toThrow()
  })
})

describe('cloudPrompt', () => {
  test('invokes only the fixed committed entrypoint with a structured encoded request', () => {
    const prompt = cloudPrompt(request)
    const encoded = prompt.match(/--request ([A-Za-z0-9_-]+)/)?.[1]
    expect(JSON.parse(Buffer.from(encoded!, 'base64url').toString())).toEqual(request)
    expect(prompt).toContain('node script/execute-cloud-evaluation.ts')
    expect(prompt).toContain('Do not solve the scenario')
  })
})

describe('preflightRelease', () => {
  test.each([
    [JSON.stringify({isPrivate: true, nameWithOwner: 'other/repo'}), draft],
    [privateRepo, JSON.stringify({isDraft: false, tagName: request.release, databaseId: request.releaseId})],
    [privateRepo, JSON.stringify({isDraft: true, tagName: 'other', databaseId: request.releaseId})],
    [privateRepo, JSON.stringify({isDraft: true, tagName: request.release, databaseId: 456})],
  ])('rejects cross-repository or published storage', async (repo, release) => {
    const {gh} = commandQueue([repo, release])
    await expect(preflightRelease(request, gh, signal())).rejects.toThrow()
  })

  describe('resolveCloudRequest', () => {
    test('pins the explicitly named draft release database ID, never latest', async () => {
      const {gh, calls} = commandQueue([draft])
      const resolved = await resolveCloudRequest({...request, releaseId: 999}, signal(), gh)
      expect(resolved.releaseId).toBe(123)
      expect(calls[0]?.args).toEqual([
        'release',
        'view',
        request.release,
        '--repo',
        request.repository,
        '--json',
        'isDraft,tagName,databaseId',
      ])
    })
  })
  test('accepts draft release storage in the same public repository', async () => {
    const {gh} = commandQueue([JSON.stringify({isPrivate: false, nameWithOwner: request.repository}), draft])
    await expect(preflightRelease(request, gh, signal())).resolves.toBeUndefined()
  })
})

describe('runCloudTask', () => {
  test('preflights storage, submits once via stdin, and persists resumable identity', async () => {
    const {gh, calls} = commandQueue([
      privateRepo,
      draft,
      'help',
      `https://github.com/owner/repo/pull/42/agent-sessions/${id}\n`,
      session(),
    ])
    const {save, files} = artifacts()
    const result = await runCloudTask(submit, {gh, save, download, signal: signal()})
    expect(result.state).toBe('completed')
    expect(calls[3]).toEqual({
      args: ['agent-task', 'create', '--repo', 'owner/repo', '--base', 'main', '--from-file', '-'],
      input: cloudPrompt(request),
    })
    expect(JSON.parse(files.get('task.json')!)).toEqual(collect)
    expect(JSON.parse(files.get('execution.json')!)).toEqual(execution)
    expect(JSON.parse(files.get('collection.json')!)).toEqual({request, session: id, execution})
    expect(files.has('session.log')).toBe(false)
  })
  test('resumes and polls without submitting', async () => {
    const {gh, calls} = commandQueue([session('queued'), session('in_progress'), session()])
    await runCloudTask(collect, {...artifacts(), gh, download, signal: signal(), pollIntervalMs: 0})
    expect(calls.some(call => call.args.includes('create'))).toBe(false)
  })
  test.each(['failed', 'cancelled', 'timed_out', 'idle', 'waiting_for_user'])(
    'retains execution evidence for session %s',
    async state => {
      const {gh} = commandQueue([session(state)])
      const {save, files} = artifacts()
      await expect(runCloudTask(collect, {gh, save, download, signal: signal()})).rejects.toThrow(
        `ended with state: ${state}`,
      )
      expect(files.has('execution.json')).toBe(true)
    },
  )
  test('does not confuse cloud completion with harness success', async () => {
    const {gh} = commandQueue([session()])
    const {save, files} = artifacts()
    await expect(
      runCloudTask(collect, {
        gh,
        save,
        signal: signal(),
        download: async () => ({...execution, state: 'failed', exitCode: 1}),
      }),
    ).rejects.toThrow('Evaluation')
    expect(JSON.parse(files.get('execution.json')!).exitCode).toBe(1)
  })
  test('rejects a result from a different run', async () => {
    const {gh} = commandQueue([session()])
    await expect(
      runCloudTask(collect, {
        ...artifacts(),
        gh,
        signal: signal(),
        download: async () => ({...execution, request: {...request, name: 'other'}}),
      }),
    ).rejects.toThrow('does not match')
  })
  test('accepts receipt provenance from an unchanged wrapper commit', async () => {
    const {gh} = commandQueue([session()])
    await expect(
      runCloudTask(collect, {
        ...artifacts(),
        gh,
        signal: signal(),
        download: async () => ({...execution, sourceCommit: 'c'.repeat(40)}),
      }),
    ).resolves.toMatchObject({state: 'completed'})
  })
  test.each([{sourceTree: 'c'.repeat(40)}, {output: null}, {output: {sha256: 'b'.repeat(64), trialCount: 0}}])(
    'rejects unsupported success evidence: %j',
    async override => {
      const {gh} = commandQueue([session()])
      await expect(
        runCloudTask(collect, {
          ...artifacts(),
          gh,
          signal: signal(),
          download: async () => ({...execution, ...override}),
        }),
      ).rejects.toThrow()
    },
  )
  test.each([
    'queued job',
    'https://github.com/owner/repo/pull/42',
    `https://github.com/other/repo/pull/42/agent-sessions/${id}`,
  ])('never retries ambiguous submission: %s', async output => {
    const {gh, calls} = commandQueue([privateRepo, draft, 'help', output])
    const {save, files} = artifacts()
    await expect(runCloudTask(submit, {gh, save, download, signal: signal()})).rejects.toThrow('do not resubmit')
    expect(files.get('submission.txt')).toBe(output)
    expect(files.has('request.json')).toBe(true)
    expect(calls.filter(call => call.args.includes('--from-file'))).toHaveLength(1)
  })
  test.each([
    {id: '12345678-1234-4123-8123-123456789abd'},
    {repository: 'other/repo'},
    {pullRequestUrl: 'https://github.com/other/repo/pull/42'},
    {state: 'unknown'},
  ])('rejects session identity mismatches: %j', async override => {
    const {gh} = commandQueue([session('completed', override)])
    await expect(runCloudTask(collect, {...artifacts(), gh, download, signal: signal()})).rejects.toThrow()
  })
  test('does not submit after cancellation', async () => {
    const controller = new AbortController()
    controller.abort(new Error('Stopped'))
    const {gh, calls} = commandQueue([])
    await expect(runCloudTask(submit, {...artifacts(), gh, download, signal: controller.signal})).rejects.toThrow(
      'Stopped',
    )
    expect(calls).toEqual([])
  })
  test('does not submit after the absolute evaluation deadline', async () => {
    const {gh, calls} = commandQueue([])
    const expired = parseCloudTask({...submit, request: {...request, deadline: '2000-01-01T00:00:00.000Z'}})
    await expect(runCloudTask(expired, {...artifacts(), gh, download, signal: signal()})).rejects.toThrow('deadline')
    expect(calls).toEqual([])
  })
  test('preserves resumable identity when polling is cancelled', async () => {
    const controller = new AbortController()
    const {save, files} = artifacts()
    const gh: Gh = async () => {
      controller.abort()
      return session('in_progress')
    }
    await expect(runCloudTask(collect, {gh, save, download, signal: controller.signal})).rejects.toThrow()
    expect(files.has('task.json')).toBe(true)
  })
})

describe('downloadCloudResults', () => {
  test('downloads exact immutable assets without extraction or overwrite', async () => {
    const {gh, calls} = commandQueue([privateRepo, draft, '', privateRepo, draft, ''])
    const result = await downloadCloudResults(request, '/results', {
      gh,
      signal: signal(),
      read: async () => JSON.stringify(execution),
    })
    expect(result).toEqual(execution)
    expect(calls.filter(call => call.args[1] === 'download').map(call => call.args)).toEqual([
      [
        'release',
        'download',
        request.release,
        '--repo',
        request.repository,
        '--dir',
        '/results',
        '--pattern',
        `${id}.execution.json`,
      ],
      [
        'release',
        'download',
        request.release,
        '--repo',
        request.repository,
        '--dir',
        '/results',
        '--pattern',
        `${id}.tar.gz`,
      ],
    ])
  })
  test('does not fetch a bundle without explicit consent', async () => {
    const minimal = {...request, exportBundle: false}
    const {gh, calls} = commandQueue([privateRepo, draft, ''])
    await downloadCloudResults(minimal, '/results', {
      gh,
      signal: signal(),
      read: async () => JSON.stringify({...execution, request: minimal}),
    })
    expect(calls).toHaveLength(3)
  })
  test('rechecks draft visibility before downloading the archive', async () => {
    const {gh, calls} = commandQueue([
      privateRepo,
      draft,
      '',
      privateRepo,
      JSON.stringify({isDraft: false, tagName: request.release, databaseId: request.releaseId}),
    ])
    await expect(
      downloadCloudResults(request, '/results', {
        gh,
        signal: signal(),
        read: async () => JSON.stringify(execution),
      }),
    ).rejects.toThrow('must already exist and be draft')
    expect(calls.filter(call => call.args[1] === 'download')).toHaveLength(1)
  })
  test('rejects mismatched status before downloading the archive', async () => {
    const {gh, calls} = commandQueue([privateRepo, draft, ''])
    await expect(
      downloadCloudResults(request, '/results', {
        gh,
        signal: signal(),
        read: async () => JSON.stringify({...execution, request: {...request, commit: 'b'.repeat(40)}}),
      }),
    ).rejects.toThrow('does not match')
    expect(calls).toHaveLength(3)
  })
})
