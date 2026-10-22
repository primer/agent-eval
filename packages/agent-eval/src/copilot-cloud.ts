import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {setTimeout} from 'node:timers/promises'
import * as z from 'zod/mini'
import type {Host} from './host'

const RepositorySchema = z.string().check(z.regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/))
const SessionIdSchema = z.uuid()
const NameSchema = z.string().check(z.regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/))
const CommitSchema = z.string().check(z.regex(/^[a-f0-9]{40}$/))
const ReleaseSchema = z.object({
  isDraft: z.boolean(),
  tagName: z.string(),
  databaseId: z.number().check(z.int(), z.positive()),
})
const RequestSchema = z.object({
  repository: RepositorySchema,
  runId: SessionIdSchema,
  kind: z.enum(['benchmark', 'experiment', 'scenario']),
  name: NameSchema,
  release: NameSchema,
  releaseId: z.number().check(z.int(), z.positive()),
  commit: CommitSchema,
  tree: CommitSchema,
  deadline: z.iso.datetime(),
  exportBundle: z.boolean(),
})
const CloudTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('submit'),
    request: RequestSchema,
    base: z.string().check(z.regex(/^[A-Za-z0-9][A-Za-z0-9_./-]*$/)),
  }),
  z.object({
    type: z.literal('collect'),
    request: RequestSchema,
    session: SessionIdSchema,
  }),
])

type CloudTask = z.infer<typeof CloudTaskSchema>
type Gh = (args: Array<string>, options: {signal: AbortSignal; input?: string}) => Promise<string>
type SaveArtifact = (name: string, content: string) => Promise<void>

const SessionSchema = z.object({
  id: SessionIdSchema,
  state: z.enum(['queued', 'in_progress', 'completed', 'failed', 'cancelled', 'timed_out', 'idle', 'waiting_for_user']),
  repository: z.nullable(RepositorySchema),
  pullRequestNumber: z.nullable(z.number().check(z.int(), z.positive())),
  pullRequestUrl: z.nullable(z.url({protocol: /^https$/, hostname: /^github\.com$/})),
  createdAt: z.nullable(z.iso.datetime({offset: true})),
  completedAt: z.nullable(z.iso.datetime({offset: true})),
})

function parseCloudTask(input: unknown): CloudTask {
  return CloudTaskSchema.parse(input)
}

function parseCloudRequest(input: unknown) {
  return RequestSchema.parse(input)
}

async function resolveCloudRequest(input: unknown, signal: AbortSignal, gh: Gh = runGh) {
  const candidate = z.omit(RequestSchema, {releaseId: true}).parse(input)
  const release = ReleaseSchema.parse(
    JSON.parse(
      await gh(
        ['release', 'view', candidate.release, '--repo', candidate.repository, '--json', 'isDraft,tagName,databaseId'],
        {signal},
      ),
    ),
  )
  if (!release.isDraft || release.tagName !== candidate.release)
    throw new Error('Results release must already exist and be draft')
  return parseCloudRequest({...candidate, releaseId: release.databaseId})
}

function cloudPrompt(request: CloudRequest) {
  const encoded = Buffer.from(JSON.stringify(request)).toString('base64url')
  return `Run the entire committed agent-eval harness, not the scenario yourself.
Execute exactly this command from the repository root:
node script/execute-cloud-evaluation.ts --request ${encoded}
Do not solve the scenario, edit files/configuration, change models/checks/judges, or retry the evaluation.
The script handles Docker, setup, inner agent, checks, judges, walkthrough, saving and export.
Do not inspect or print secrets. Do not commit results, logs or credentials to the PR.
Report the script exit status; a completed cloud session is not evidence of evaluation success.`
}

const runGh: Gh = (args, {signal, input}) => {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'gh',
      args,
      {
        signal,
        timeout: 120_000,
        maxBuffer: 32 * 1024 * 1024,
        env: {...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat', NO_COLOR: '1'},
      },
      (err, stdout) => {
        if (err) {
          reject(err)
        } else {
          resolve(stdout)
        }
      },
    )
    child.stdin?.on('error', () => {
      // execFile reports process failures through its callback.
    })
    child.stdin?.end(input)
  })
}

async function runCloudTask(
  task: CloudTask,
  {
    signal,
    save,
    gh = runGh,
    download,
    pollIntervalMs = 15_000,
  }: {
    signal: AbortSignal
    save: SaveArtifact
    gh?: Gh
    download: (request: CloudRequest, signal: AbortSignal) => Promise<unknown>
    pollIntervalMs?: number
  },
) {
  signal.throwIfAborted()
  const {request} = task
  const repository = request.repository
  let sessionId: string
  if (task.type === 'submit') {
    if (Date.parse(request.deadline) <= Date.now()) throw new Error('Evaluation deadline has expired')
    await preflightRelease(request, gh, signal)
    await save('request.json', JSON.stringify(request, null, 2))
    // Check command availability before performing the non-idempotent submission.
    await gh(['agent-task', 'create', '--help'], {signal})
    const output = await gh(['agent-task', 'create', '--repo', repository, '--base', task.base, '--from-file', '-'], {
      signal,
      input: cloudPrompt(request),
    })
    await save('submission.txt', output)
    const url = new URL(output.trim().startsWith('https://') ? output.trim() : 'https://github.com')
    const match = /^\/([^/]+\/[^/]+)\/pull\/[1-9][0-9]*\/agent-sessions\/([^/]+)$/.exec(url.pathname)
    if (url.origin !== 'https://github.com' || !match || match[1].toLowerCase() !== repository.toLowerCase()) {
      throw new Error(
        'Task may already be queued, but gh did not return a session URL. Inspect submission.txt and ' +
          'gh agent-task list --json id,repository,state. Resume with --session; do not resubmit automatically.',
      )
    }
    sessionId = SessionIdSchema.parse(match[2])
  } else {
    sessionId = task.session
  }

  await save('task.json', JSON.stringify({type: 'collect', request, session: sessionId}, null, 2))
  while (true) {
    signal.throwIfAborted()
    const raw = await gh(
      [
        'agent-task',
        'view',
        sessionId,
        '--repo',
        repository,
        '--json',
        'id,state,repository,pullRequestNumber,pullRequestUrl,createdAt,completedAt',
      ],
      {signal},
    )
    await save('session.json', raw)
    const session = SessionSchema.parse(JSON.parse(raw))
    if (
      session.id !== sessionId ||
      (session.repository !== null && session.repository.toLowerCase() !== repository.toLowerCase())
    ) {
      throw new Error('Session identity or repository does not match the requested cloud task')
    }
    if (
      session.pullRequestUrl !== null &&
      session.pullRequestUrl.toLowerCase() !==
        `https://github.com/${repository}/pull/${session.pullRequestNumber}`.toLowerCase()
    ) {
      throw new Error('Session pull request does not match the requested repository')
    }
    if (session.state === 'queued' || session.state === 'in_progress') {
      await setTimeout(pollIntervalMs, undefined, {signal})
      continue
    }

    // Collect durable results independently of whether the outer session succeeded.
    const execution = parseCloudExecution(await download(request, signal))
    assertExecution(request, execution)
    await save('execution.json', JSON.stringify(execution, null, 2))
    await save('collection.json', JSON.stringify({request, session: sessionId, execution}, null, 2))
    if (session.state !== 'completed') {
      throw new Error(`Copilot cloud session ${sessionId} ended with state: ${session.state}`)
    }
    if (execution.state !== 'succeeded') {
      throw new Error(`Evaluation ${request.runId} ended with state: ${execution.state} (exit ${execution.exitCode})`)
    }
    return session
  }
}

type CloudRequest = z.infer<typeof RequestSchema>
const ExecutionSchema = z.object({
  request: RequestSchema,
  state: z.enum(['succeeded', 'failed', 'timed_out']),
  exitCode: z.number().check(z.int()),
  sourceCommit: z.nullable(CommitSchema),
  sourceTree: z.nullable(CommitSchema),
  output: z.nullable(
    z.object({
      sha256: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
      trialCount: z.number().check(z.int(), z.positive()),
    }),
  ),
})
function parseCloudExecution(input: unknown) {
  return ExecutionSchema.parse(input)
}
function assertExecution(request: CloudRequest, execution: z.infer<typeof ExecutionSchema>) {
  if (JSON.stringify(request) !== JSON.stringify(execution.request)) {
    throw new Error('Execution does not match the requested run')
  }
  if ((execution.state === 'succeeded') !== (execution.exitCode === 0)) {
    throw new Error('Inconsistent execution status')
  }
  if (
    execution.state === 'succeeded' &&
    (execution.sourceCommit === null || execution.sourceTree !== request.tree || execution.output === null)
  ) {
    throw new Error('Successful execution requires the pinned source tree and nonempty output')
  }
}

async function preflightRelease(request: CloudRequest, gh: Gh, signal: AbortSignal) {
  const repo = z
    .object({nameWithOwner: RepositorySchema})
    .parse(JSON.parse(await gh(['repo', 'view', request.repository, '--json', 'nameWithOwner'], {signal})))
  if (repo.nameWithOwner.toLowerCase() !== request.repository.toLowerCase()) {
    throw new Error('Results storage must be the same repository')
  }
  const release = ReleaseSchema.parse(
    JSON.parse(
      await gh(
        ['release', 'view', request.release, '--repo', request.repository, '--json', 'isDraft,tagName,databaseId'],
        {
          signal,
        },
      ),
    ),
  )
  if (!release.isDraft || release.tagName !== request.release)
    throw new Error('Results release must already exist and be draft')
  if (release.databaseId !== request.releaseId) throw new Error('Results release identity changed')
}

async function downloadCloudResults(
  request: CloudRequest,
  directory: string,
  {gh = runGh, read, signal}: {gh?: Gh; read: (filename: string) => Promise<string>; signal: AbortSignal},
) {
  await preflightRelease(request, gh, signal)
  const status = `${request.runId}.execution.json`
  await gh(
    ['release', 'download', request.release, '--repo', request.repository, '--dir', directory, '--pattern', status],
    {signal},
  )
  const execution = parseCloudExecution(JSON.parse(await read(status)))
  assertExecution(request, execution)
  if (request.exportBundle) {
    await preflightRelease(request, gh, signal)
    await gh(
      [
        'release',
        'download',
        request.release,
        '--repo',
        request.repository,
        '--dir',
        directory,
        '--pattern',
        `${request.runId}.tar.gz`,
      ],
      {signal},
    )
  }
  return execution
}

class CommandFailure extends Error {
  readonly exitCode: number
  constructor(exitCode: number) {
    super(`Command failed (exit ${exitCode})`)
    this.exitCode = exitCode
  }
}

type Command = (
  program: string,
  args: Array<string>,
  options: {signal: AbortSignal; credentials: 'storage' | 'evaluation' | 'none'},
) => Promise<string>
type EvaluationIO = {
  command: Command
  claim: (directory: string) => Promise<void>
  save: (filename: string, contents: string) => Promise<void>
  read: (filename: string) => Promise<string>
  inspectExport: (filename: string, signal: AbortSignal) => Promise<void>
  now?: () => number
  timeout?: (milliseconds: number) => AbortSignal
}

async function executeCloudEvaluation(request: CloudRequest, io: EvaluationIO) {
  const directory = `results/cloud/${request.runId}`
  // An exclusive persistent claim prevents the outer agent from retrying a costly run.
  await io.claim(directory)
  const now = io.now ?? Date.now
  const timeout = io.timeout ?? AbortSignal.timeout
  const remaining = Date.parse(request.deadline) - now()
  let exitCode: number
  let state: 'failed' | 'timed_out' | 'succeeded'
  let sourceCommit: string | null = null
  let sourceTree: string | null = null
  let output: {sha256: string; trialCount: number} | null = null
  const signal = timeout(Math.max(1, Math.min(remaining, 86_400_000)))
  const command = (program: string, args: Array<string>, credentials: 'storage' | 'evaluation' | 'none' = 'none') =>
    io.command(program, args, {signal, credentials})
  const gh: Gh = (args, options) => io.command('gh', args, {signal: options.signal, credentials: 'storage'})
  try {
    if (remaining <= 0) throw new Error('Evaluation deadline expired')
    await preflightRelease(request, gh, signal)
    await command('node', ['--version'], 'evaluation')
    const actualRepo = z
      .object({nameWithOwner: z.string()})
      .parse(JSON.parse(await command('gh', ['repo', 'view', '--json', 'nameWithOwner'], 'storage')))
    if (actualRepo.nameWithOwner.toLowerCase() !== request.repository.toLowerCase()) {
      throw new Error('Checkout does not match requested repository')
    }
    sourceCommit = CommitSchema.parse((await command('git', ['rev-parse', 'HEAD'])).trim())
    sourceTree = CommitSchema.parse((await command('git', ['rev-parse', 'HEAD^{tree}'])).trim())
    if (sourceTree !== request.tree) {
      throw new Error('Checkout does not match requested source tree')
    }
    await command('git', ['diff', '--quiet', 'HEAD', '--'])
    await command('docker', ['info'])
    await command('pnpm', ['--version'])
    await command('tar', ['--version'])
    await command('pnpm', ['install', '--frozen-lockfile'])
    await command('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=@primer/agent-eval'])
    sourceCommit = CommitSchema.parse((await command('git', ['rev-parse', 'HEAD'])).trim())
    sourceTree = CommitSchema.parse((await command('git', ['rev-parse', 'HEAD^{tree}'])).trim())
    if (sourceTree !== request.tree) throw new Error('Source tree changed during build')
    await command('git', ['diff', '--quiet', 'HEAD', '--'])
    await command(
      'node',
      ['packages/agent-eval/bin/agent-eval', request.kind, 'run', request.name, '--output-dir', `${directory}/bundle`],
      'evaluation',
    )
    const contents = await io.read(`${directory}/bundle/output.json`)
    const parsed: unknown = JSON.parse(contents)
    let trialCount: number
    if (request.kind === 'scenario') {
      trialCount = z
        .object({
          results: z
            .array(
              z.object({
                trial: z.object({id: z.string().check(z.minLength(1))}),
                result: z.unknown(),
              }),
            )
            .check(z.minLength(1)),
        })
        .parse(parsed).results.length
    } else {
      const manifest = z.object({trials: z.record(z.string(), z.string().check(z.minLength(1)))}).parse(parsed)
      const entries = z
        .array(z.tuple([z.string(), z.string()]))
        .check(z.minLength(1))
        .parse(Object.entries(manifest.trials))
      for (const [id, filename] of entries) {
        const target = path.resolve(`${directory}/bundle`, filename)
        const relative = path.relative(path.resolve(`${directory}/bundle`), target)
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Trial output escapes bundle')
        const trial = z.object({id: z.string()}).parse(JSON.parse(await io.read(target)))
        if (trial.id !== id) throw new Error('Trial output identity mismatch')
      }
      trialCount = entries.length
    }
    output = {sha256: createHash('sha256').update(contents).digest('hex'), trialCount}
    exitCode = 0
    state = 'succeeded'
  } catch (err) {
    state = signal.aborted || remaining <= 0 ? 'timed_out' : 'failed'
    exitCode = state === 'timed_out' ? 124 : err instanceof CommandFailure ? err.exitCode : 1
  }
  const execution = parseCloudExecution({request, state, exitCode, sourceCommit, sourceTree, output})
  const status = `${directory}/${request.runId}.execution.json`
  await io.save(status, JSON.stringify(execution, null, 2))
  // Export gets its own bounded grace period even when the evaluation hit its deadline.
  const exportSignal = timeout(120_000)
  await io.inspectExport(status, exportSignal)
  await preflightRelease(request, gh, exportSignal)
  await io.command('gh', ['release', 'upload', request.release, '--repo', request.repository, status], {
    signal: exportSignal,
    credentials: 'storage',
  })
  if (request.exportBundle) {
    const archive = `${directory}/${request.runId}.tar.gz`
    await io.inspectExport(`${directory}/bundle`, exportSignal)
    await io.command('tar', ['-czf', archive, '-C', directory, 'bundle'], {
      signal: exportSignal,
      credentials: 'none',
    })
    await preflightRelease(request, gh, exportSignal)
    await io.command('gh', ['release', 'upload', request.release, '--repo', request.repository, archive], {
      signal: exportSignal,
      credentials: 'storage',
    })
  }
  return execution
}

async function inspectCloudBundle(
  directory: string,
  secrets: Array<string>,
  signal: AbortSignal,
  host: Pick<Host, 'fs'> = {fs},
) {
  const needles = secrets.filter(value => value.length > 0).map(value => Buffer.from(value))
  const overlap = Math.max(0, ...needles.map(value => value.length - 1))
  function rejectCredentials(content: Buffer) {
    if (needles.some(needle => content.includes(needle))) {
      throw new Error('Bundle export refused: known credential material is present')
    }
  }
  async function inspect(filename: string): Promise<void> {
    signal.throwIfAborted()
    rejectCredentials(Buffer.from(path.relative(directory, filename)))
    const stat = await host.fs.promises.lstat(filename)
    if (stat.isDirectory()) {
      for (const entry of await host.fs.promises.readdir(filename)) {
        await inspect(path.join(filename, entry))
      }
      return
    }
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new Error('Bundle export refused: links or special files are present')
    }
    const file = await host.fs.promises.open(
      filename,
      host.fs.constants.O_RDONLY | host.fs.constants.O_NOFOLLOW | host.fs.constants.O_NONBLOCK,
    )
    try {
      const opened = await file.stat()
      if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== stat.ino || opened.dev !== stat.dev) {
        throw new Error('Bundle export refused: file changed during inspection')
      }
      const chunk = Buffer.alloc(64 * 1024)
      let tail = Buffer.alloc(0)
      while (true) {
        signal.throwIfAborted()
        const {bytesRead} = await file.read(chunk, 0, chunk.length, null)
        if (bytesRead === 0) break
        const content = Buffer.concat([tail, chunk.subarray(0, bytesRead)])
        rejectCredentials(content)
        tail = overlap === 0 ? Buffer.alloc(0) : content.subarray(Math.max(0, content.length - overlap))
      }
    } finally {
      await file.close()
    }
  }
  await inspect(directory)
}

export {
  parseCloudTask,
  parseCloudRequest,
  resolveCloudRequest,
  parseCloudExecution,
  runCloudTask,
  runGh,
  cloudPrompt,
  preflightRelease,
  downloadCloudResults,
  executeCloudEvaluation,
  CommandFailure,
  inspectCloudBundle,
}
export type {Gh, CloudRequest, Command, EvaluationIO}
