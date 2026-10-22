import {spawn} from 'node:child_process'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {parseArgs} from 'node:util'
import {
  parseCloudRequest,
  executeCloudEvaluation,
  CommandFailure,
  inspectCloudBundle,
  type Command,
} from '../packages/agent-eval/src/copilot-cloud.ts'

const {values} = parseArgs({options: {request: {type: 'string'}, help: {type: 'boolean'}}})
if (values.help) {
  console.log(
    'Remote entrypoint: node script/execute-cloud-evaluation.ts --request BASE64URL_JSON\nUse run-cloud-task.ts locally to create a bound request. Never run untrusted configurations.',
  )
} else {
  try {
    if (!values.request || !/^[A-Za-z0-9_-]+$/.test(values.request)) throw new Error('Missing or malformed request')
    const request = parseCloudRequest(JSON.parse(Buffer.from(values.request, 'base64url').toString('utf8')))
    const command: Command = (program, args, {signal, credentials}) =>
      new Promise((resolve, reject) => {
        signal.throwIfAborted()
        const env: NodeJS.ProcessEnv = {...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat'}
        delete env.GH_TOKEN
        delete env.GITHUB_TOKEN
        delete env.GH_REPO
        delete env.COPILOT_GITHUB_TOKEN
        delete env.CLOUD_EVAL_GITHUB_TOKEN
        if (credentials === 'storage') {
          if (!process.env.CLOUD_EVAL_GITHUB_TOKEN) return reject(new Error('CLOUD_EVAL_GITHUB_TOKEN is required'))
          env.GH_TOKEN = process.env.CLOUD_EVAL_GITHUB_TOKEN
        }
        if (credentials === 'evaluation') {
          if (!process.env.COPILOT_GITHUB_TOKEN) return reject(new Error('COPILOT_GITHUB_TOKEN is required'))
          env.COPILOT_GITHUB_TOKEN = process.env.COPILOT_GITHUB_TOKEN
        }
        const child = spawn(program, args, {env, detached: true, stdio: ['ignore', 'pipe', 'ignore']})
        let stdout = ''
        child.stdout?.on('data', (data: Buffer) => {
          // Harness stdout can contain scenario data; do not echo it into the outer agent transcript.
          if (stdout.length < 1024 * 1024) stdout += data.toString()
        })
        const kill = (terminationSignal: NodeJS.Signals) => {
          if (child.pid) {
            try {
              process.kill(-child.pid, terminationSignal)
            } catch {
              /* Process may already have exited. */
            }
          }
        }
        let forceKill: NodeJS.Timeout | undefined
        const abort = () => {
          kill('SIGTERM')
          // Give the ordinary harness a bounded opportunity to clean up its tracked containers.
          forceKill = setTimeout(() => kill('SIGKILL'), 5000)
          forceKill.unref()
        }
        signal.addEventListener('abort', abort, {once: true})
        if (signal.aborted) abort()
        child.on('error', reject)
        child.on('close', code => {
          clearTimeout(forceKill)
          signal.removeEventListener('abort', abort)
          if (code === 0 && !signal.aborted) resolve(stdout)
          else reject(new CommandFailure(code ?? 1))
        })
      })
    const execution = await executeCloudEvaluation(request, {
      command,
      async claim(directory) {
        await mkdir('results/cloud', {recursive: true})
        await mkdir(directory, {mode: 0o700})
        await mkdir(`${directory}/bundle`, {mode: 0o700})
      },
      async save(filename, contents) {
        await writeFile(filename, contents, {mode: 0o600})
      },
      read: filename => readFile(filename, 'utf8'),
      async inspectExport(directory, signal) {
        const secrets = Object.entries(process.env).flatMap(([name, value]) =>
          /token|secret|password|credential|api_?key|private_?key/i.test(name) && value ? [value] : [],
        )
        await inspectCloudBundle(directory, secrets, signal)
      },
    })
    console.log(`Evaluation ${request.runId}: ${execution.state}`)
    process.exitCode = execution.exitCode
  } catch {
    console.error('Cloud evaluation failed; inspect retained results/cloud run status. No automatic retry.')
    process.exitCode = 1
  }
}
