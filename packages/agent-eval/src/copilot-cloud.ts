import {execFile} from 'node:child_process'
import {setTimeout} from 'node:timers/promises'
import * as z from 'zod/mini'

const RepositorySchema = z.string().check(z.regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/))
const SessionIdSchema = z.uuid()
const CloudTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('submit'),
    repository: RepositorySchema,
    prompt: z.string().check(z.trim(), z.minLength(1)),
    base: z.string().check(z.trim(), z.minLength(1)),
  }),
  z.object({
    type: z.literal('collect'),
    repository: RepositorySchema,
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

const PullRequestSchema = z.object({
  baseRefOid: z.string().check(z.regex(/^[a-f0-9]{40}$/)),
  headRefOid: z.string().check(z.regex(/^[a-f0-9]{40}$/)),
})

function parseCloudTask(input: unknown): CloudTask {
  return CloudTaskSchema.parse(input)
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
    pollIntervalMs = 15_000,
  }: {
    signal: AbortSignal
    save: SaveArtifact
    gh?: Gh
    pollIntervalMs?: number
  },
) {
  signal.throwIfAborted()
  let sessionId: string
  if (task.type === 'submit') {
    // Check command availability before performing the non-idempotent submission.
    await gh(['agent-task', 'create', '--help'], {signal})
    const output = await gh(
      ['agent-task', 'create', '--repo', task.repository, '--base', task.base, '--from-file', '-'],
      {signal, input: task.prompt},
    )
    await save('submission.txt', output)
    const url = new URL(output.trim().startsWith('https://') ? output.trim() : 'https://github.com')
    const match = /^\/([^/]+\/[^/]+)\/pull\/[1-9][0-9]*\/agent-sessions\/([^/]+)$/.exec(url.pathname)
    if (url.origin !== 'https://github.com' || !match || match[1].toLowerCase() !== task.repository.toLowerCase()) {
      throw new Error(
        'Task may already be queued, but gh did not return a session URL. Inspect submission.txt and ' +
          'gh agent-task list --json id,repository,state. Resume with --session; do not resubmit automatically.',
      )
    }
    sessionId = SessionIdSchema.parse(match[2])
  } else {
    sessionId = task.session
  }

  await save('task.json', JSON.stringify({repository: task.repository, session: sessionId}, null, 2))
  while (true) {
    signal.throwIfAborted()
    const raw = await gh(
      [
        'agent-task',
        'view',
        sessionId,
        '--repo',
        task.repository,
        '--json',
        'id,state,repository,pullRequestNumber,pullRequestUrl,createdAt,completedAt',
      ],
      {signal},
    )
    await save('session.json', raw)
    const session = SessionSchema.parse(JSON.parse(raw))
    if (
      session.id !== sessionId ||
      (session.repository !== null && session.repository.toLowerCase() !== task.repository.toLowerCase())
    ) {
      throw new Error('Session identity or repository does not match the requested cloud task')
    }
    if (
      session.pullRequestUrl !== null &&
      session.pullRequestUrl.toLowerCase() !==
        `https://github.com/${task.repository}/pull/${session.pullRequestNumber}`.toLowerCase()
    ) {
      throw new Error('Session pull request does not match the requested repository')
    }
    if (session.state === 'queued' || session.state === 'in_progress') {
      await setTimeout(pollIntervalMs, undefined, {signal})
      continue
    }

    await save('session.log', await gh(['agent-task', 'view', sessionId, '--repo', task.repository, '--log'], {signal}))
    if (session.pullRequestNumber !== null) {
      const pr = String(session.pullRequestNumber)
      const snapshot = await gh(['pr', 'view', pr, '--repo', task.repository, '--json', 'baseRefOid,headRefOid'], {
        signal,
      })
      await save('pull-request.json', snapshot)
      const {baseRefOid, headRefOid} = PullRequestSchema.parse(JSON.parse(snapshot))
      await save(
        'changes.diff',
        await gh(
          [
            'api',
            `repos/${task.repository}/compare/${baseRefOid}...${headRefOid}`,
            '--header',
            'Accept: application/vnd.github.diff',
          ],
          {signal},
        ),
      )
    }
    if (session.state !== 'completed') {
      throw new Error(`Copilot cloud session ${sessionId} ended with state: ${session.state}`)
    }
    return session
  }
}

export {parseCloudTask, runCloudTask}
export type {Gh}
