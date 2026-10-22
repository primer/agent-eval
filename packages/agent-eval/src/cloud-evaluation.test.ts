import {describe, expect, test} from 'vitest'
import {
  executeCloudEvaluation,
  CommandFailure,
  inspectCloudBundle,
  collectCloudExportSecrets,
  type Command,
  type EvaluationIO,
} from './copilot-cloud'
import {parseCloudRequest} from './copilot-cloud'
import {VirtualHost} from './host'

const request = parseCloudRequest({
  repository: 'owner/repo',
  runId: '12345678-1234-4123-8123-123456789abc',
  kind: 'scenario',
  name: '001-example',
  release: 'results',
  releaseId: 123,
  commit: 'a'.repeat(40),
  tree: 'd'.repeat(40),
  deadline: '2099-01-01T00:00:00.000Z',
  exportBundle: true,
})
function memory(options: {fail?: string; repo?: string; commit?: string; tree?: string} = {}) {
  const calls: Array<{program: string; args: Array<string>; credentials: string}> = []
  const files = new Map<string, string>()
  const claims = new Set<string>()
  const command: Command = async (program, args, {credentials, signal}) => {
    signal.throwIfAborted()
    calls.push({program, args, credentials})
    if (`${program} ${args[0]}` === options.fail) throw new CommandFailure(23)
    if (program === 'gh' && args[0] === 'repo')
      return JSON.stringify({
        isPrivate: true,
        nameWithOwner: args[2] === '--json' ? (options.repo ?? request.repository) : request.repository,
      })
    if (program === 'gh' && args[0] === 'release' && args[1] === 'view')
      return JSON.stringify({isDraft: true, tagName: request.release, databaseId: request.releaseId})
    if (program === 'git' && args[1] === 'HEAD^{tree}') return options.tree ?? request.tree
    if (program === 'git') return options.commit ?? request.commit
    return ''
  }
  const io: EvaluationIO = {
    command,
    async read(filename) {
      return filename.endsWith('/output.json')
        ? JSON.stringify({results: [{trial: {id: 'trial'}, result: {}}], trials: {trial: 'artifacts/trial.json'}})
        : JSON.stringify({id: 'trial'})
    },
    async inspectExport() {},
    async claim(directory) {
      if (claims.has(directory)) throw new Error('Already claimed')
      claims.add(directory)
    },
    async save(name, content) {
      files.set(name, content)
    },
  }
  return {io, calls, files}
}
describe('executeCloudEvaluation', () => {
  test.each(['benchmark', 'experiment', 'scenario'] as const)(
    'runs the ordinary full %s pipeline with separate token scopes',
    async kind => {
      const {io, calls, files} = memory()
      const result = await executeCloudEvaluation({...request, kind}, io)
      expect(result.state).toBe('succeeded')
      expect(result.sourceCommit).toBe(request.commit)
      expect(result.sourceTree).toBe(request.tree)
      expect(result.output?.trialCount).toBe(1)
      expect(calls.find(call => call.args[0] === 'packages/agent-eval/bin/agent-eval')).toEqual({
        program: 'node',
        args: [
          'packages/agent-eval/bin/agent-eval',
          kind,
          'run',
          request.name,
          '--output-dir',
          `results/cloud/${request.runId}/bundle`,
        ],
        credentials: 'evaluation',
      })
      expect(calls.find(call => call.program === 'docker')?.args).toEqual(['info'])
      expect(calls.find(call => call.args[0] === 'install')?.credentials).toBe('none')
      const uploads = calls.filter(call => call.args[1] === 'upload')
      expect(uploads).toHaveLength(2)
      expect(uploads.every(call => call.credentials === 'storage' && !call.args.includes('--clobber'))).toBe(true)
      expect(files.size).toBe(1)
    },
  )
  test('exports only status by default and retains full normal results locally', async () => {
    const {io, calls} = memory()
    await executeCloudEvaluation({...request, exportBundle: false}, io)
    expect(calls.some(call => call.program === 'tar' && call.args[0] === '-czf')).toBe(false)
    expect(calls.filter(call => call.args[1] === 'upload')).toHaveLength(1)
  })
  test('persists and exports failed execution before attempting bundle export', async () => {
    const {io, calls, files} = memory({fail: 'node packages/agent-eval/bin/agent-eval'})
    const result = await executeCloudEvaluation(request, io)
    expect(result.state).toBe('failed')
    expect(result.exitCode).toBe(23)
    expect(JSON.parse([...files.values()][0]!).state).toBe('failed')
    expect(calls.findIndex(call => call.args[1] === 'upload')).toBeLessThan(
      calls.findIndex(call => call.args[0] === '-czf'),
    )
  })
  test.each([{repo: 'other/repo'}, {tree: 'b'.repeat(40)}, {fail: 'git diff'}, {fail: 'docker info'}])(
    'fails preflight without running the evaluation: %j',
    async options => {
      const {io, calls} = memory(options)
      const result = await executeCloudEvaluation({...request, exportBundle: false}, io)
      expect(result.state).toBe('failed')
      expect(calls.some(call => call.args[0] === 'packages/agent-eval/bin/agent-eval')).toBe(false)
    },
  )
  test('never repeats a claimed run', async () => {
    const {io, calls} = memory()
    await executeCloudEvaluation(request, io)
    const count = calls.length
    await expect(executeCloudEvaluation(request, io)).rejects.toThrow('Already claimed')
    expect(calls).toHaveLength(count)
  })
  test('exports timeout evidence without running an expired evaluation', async () => {
    const {io, calls} = memory()
    const result = await executeCloudEvaluation(
      {...request, deadline: '2000-01-01T00:00:00.000Z', exportBundle: false},
      io,
    )
    expect(result.state).toBe('timed_out')
    expect(result.exitCode).toBe(124)
    expect(calls.some(call => call.program === 'docker')).toBe(false)
    expect(calls.some(call => call.args[1] === 'upload')).toBe(true)
  })
  test('aborts active work on deadline and exports using a fresh grace-period signal', async () => {
    const {io, calls} = memory()
    const controller = new AbortController()
    io.timeout = milliseconds => (milliseconds === 120_000 ? new AbortController().signal : controller.signal)
    const original = io.command
    io.command = async (program, args, options) => {
      if (args[0] === 'packages/agent-eval/bin/agent-eval') {
        controller.abort(new Error('Deadline'))
      }
      return original(program, args, options)
    }
    const result = await executeCloudEvaluation({...request, exportBundle: false}, io)
    expect(result.state).toBe('timed_out')
    expect(result.exitCode).toBe(124)
    expect(calls.some(call => call.args[1] === 'upload')).toBe(true)
  })
  test('retains local execution evidence when durable upload fails', async () => {
    const {io, files} = memory({fail: 'gh release'})
    await expect(executeCloudEvaluation(request, io)).rejects.toThrow('Command failed')
    expect(files.size).toBe(1)
  })
  test.each([
    {kind: 'scenario', contents: '{"results":[]}'},
    {kind: 'benchmark', contents: '{"trials":{}}'},
    {kind: 'experiment', contents: '{"trials":{}}'},
    {kind: 'scenario', contents: 'not JSON'},
  ] as const)('does not report success for missing/nonempty output contract: %j', async ({kind, contents}) => {
    const {io} = memory()
    io.read = async () => contents
    const result = await executeCloudEvaluation({...request, kind, exportBundle: false}, io)
    expect(result.state).toBe('failed')
    expect(result.exitCode).toBe(1)
    expect(result.output).toBeNull()
  })
  test('does not report success when the output manifest is missing', async () => {
    const {io} = memory()
    io.read = async () => {
      throw new Error('Missing output')
    }
    const result = await executeCloudEvaluation({...request, exportBundle: false}, io)
    expect(result.state).toBe('failed')
    expect(result.output).toBeNull()
  })
  test('accepts an unchanged wrapper commit and records its actual HEAD provenance', async () => {
    const {io} = memory({commit: 'b'.repeat(40)})
    const result = await executeCloudEvaluation({...request, exportBundle: false}, io)
    expect(result.state).toBe('succeeded')
    expect(result.sourceCommit).toBe('b'.repeat(40))
    expect(result.sourceTree).toBe(request.tree)
  })
  test('rejects source tree changes introduced during the build', async () => {
    const {io, calls} = memory()
    const command = io.command
    let treeReads = 0
    io.command = async (program, args, options) => {
      if (program === 'git' && args[1] === 'HEAD^{tree}' && ++treeReads === 2) return 'b'.repeat(40)
      return command(program, args, options)
    }
    const result = await executeCloudEvaluation({...request, exportBundle: false}, io)
    expect(result.state).toBe('failed')
    expect(calls.some(call => call.args[0] === 'packages/agent-eval/bin/agent-eval')).toBe(false)
  })
  test('rejects dangling or mismatched per-trial output files', async () => {
    const {io} = memory()
    const read = io.read
    io.read = filename => (filename.endsWith('/output.json') ? read(filename) : Promise.resolve('{"id":"other"}'))
    const result = await executeCloudEvaluation({...request, kind: 'benchmark', exportBundle: false}, io)
    expect(result.state).toBe('failed')
    expect(result.output).toBeNull()
  })
  test('retains status but refuses archive creation and upload when inspection fails', async () => {
    const {io, calls, files} = memory()
    io.inspectExport = async filename => {
      if (filename.endsWith('/bundle')) throw new Error('Bundle export refused')
    }
    await expect(executeCloudEvaluation(request, io)).rejects.toThrow('Bundle export refused')
    expect(files.size).toBe(1)
    expect(calls.filter(call => call.args[1] === 'upload')).toHaveLength(1)
    expect(calls.some(call => call.args[0] === '-czf')).toBe(false)
  })
  test('rechecks draft visibility immediately before uploading the archive', async () => {
    const {io, calls} = memory()
    const original = io.command
    let checks = 0
    io.command = async (program, args, options) => {
      if (program === 'gh' && args[0] === 'release' && args[1] === 'view' && ++checks === 3) {
        return JSON.stringify({isDraft: false, tagName: request.release, databaseId: request.releaseId})
      }
      return original(program, args, options)
    }
    await expect(executeCloudEvaluation(request, io)).rejects.toThrow('must already exist and be draft')
    expect(calls.filter(call => call.args[1] === 'upload')).toHaveLength(1)
  })
})

describe('inspectCloudBundle', () => {
  test('accepts ordinary nested files without copying or changing the normal bundle', async () => {
    const host = VirtualHost.create({
      '/bundle/output.json': '{"results":[]}',
      '/bundle/walkthrough/video': 'video data',
    })

    await expect(
      inspectCloudBundle('/bundle', ['fixture-sensitive-value'], new AbortController().signal, host),
    ).resolves.toBeUndefined()
    expect(await host.fs.promises.readFile('/bundle/output.json', 'utf8')).toBe('{"results":[]}')
  })
  test('rejects known credentials even across file-stream chunk boundaries', async () => {
    const secret = 'fixture-sensitive-value'
    const host = VirtualHost.create({'/bundle/.copilot/config.json': `${'a'.repeat(65_530)}${secret}`})
    await expect(inspectCloudBundle('/bundle', [secret], new AbortController().signal, host)).rejects.toThrow(
      'known credential material',
    )
  })
  test('does not follow symbolic links outside the bundle', async () => {
    const host = VirtualHost.create({'/bundle/output.json': '{}', '/outside': 'confidential source'})
    await host.fs.promises.symlink('/outside', '/bundle/link')
    await expect(inspectCloudBundle('/bundle', [], new AbortController().signal, host)).rejects.toThrow(
      'links or special files',
    )
  })
  test('rejects known credentials in archive member names', async () => {
    const secret = 'fixture-sensitive-value'
    const host = VirtualHost.create({[`/bundle/${secret}.json`]: '{}'})
    await expect(inspectCloudBundle('/bundle', [secret], new AbortController().signal, host)).rejects.toThrow(
      'known credential material',
    )
  })
  test('rejects hardlinks even when they contain no known credentials', async () => {
    const host = VirtualHost.create({'/bundle/output.json': '{}', '/outside': 'confidential source'})
    await host.fs.promises.link('/outside', '/bundle/link')
    await expect(inspectCloudBundle('/bundle', [], new AbortController().signal, host)).rejects.toThrow(
      'links or special files',
    )
  })
  test('does not inspect files after cancellation', async () => {
    const host = VirtualHost.create({'/bundle/output.json': '{}'})
    const controller = new AbortController()
    controller.abort(new Error('Stopped'))
    await expect(inspectCloudBundle('/bundle', [], controller.signal, host)).rejects.toThrow('Stopped')
  })
})

describe('collectCloudExportSecrets', () => {
  test('collects real credential values without treating secret-filtering flags or name lists as secrets', async () => {
    const secrets = collectCloudExportSecrets({
      COPILOT_ENABLE_SECRET_FILTERING: 'true',
      COPILOT_GITHUB_TOKEN: 'long-fixture-token',
      COPILOT_SECRET_NAMES: '["COPILOT_GITHUB_TOKEN"]',
    })
    expect(secrets).toEqual(['long-fixture-token'])
    const host = VirtualHost.create({'/bundle/output.json': '{"completed":true}'})
    await expect(inspectCloudBundle('/bundle', secrets, new AbortController().signal, host)).resolves.toBeUndefined()
  })
  test('ignores short or missing values and arbitrary variables mentioning secrets', () => {
    expect(
      collectCloudExportSecrets({
        GH_TOKEN: 'true',
        PASSWORD: 'short',
        API_KEY: undefined,
        SECRET_FILTERING: 'long-feature-flag-value',
        SOME_SECRET_PROVIDER: 'long-provider-name-value',
        CLOUD_EVAL_GITHUB_TOKEN: 'long-fixture-upload-token',
        MODEL_API_KEY: 'long-fixture-model-key',
      }),
    ).toEqual(['long-fixture-upload-token', 'long-fixture-model-key'])
  })
})
