import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {parseArgs} from 'node:util'
import {parseCloudTask, runCloudTask} from '../packages/agent-eval/src/copilot-cloud.ts'

const {values} = parseArgs({
  options: {
    submit: {type: 'boolean', default: false},
    repo: {type: 'string'},
    base: {type: 'string'},
    'prompt-file': {type: 'string'},
    session: {type: 'string'},
    'output-dir': {type: 'string'},
    'timeout-seconds': {type: 'string', default: '3600'},
    help: {type: 'boolean', default: false},
  },
})

if (values.help) {
  console.log(`Prototype: run GitHub-hosted Copilot without Docker (requires gh agent-task).
Submit (creates a remote PR and consumes Copilot quota):
  node script/run-cloud-task.ts --submit --repo OWNER/REPO --base BRANCH --prompt-file FILE --output-dir DIR
Resume collection (never submits):
  node script/run-cloud-task.ts --repo OWNER/REPO --session UUID --output-dir NEW_DIR
Options:
  --timeout-seconds N  Overall local timeout, default 3600; does not cancel remote work
Outputs: task.json, session.json, session.log, pull-request.json, changes.diff.
Use a fresh output directory. This is not a benchmark runner and does not run graders.`)
} else {
  try {
    if (!values['output-dir']) {
      throw new Error('--output-dir is required and must not already exist')
    }
    const timeoutSeconds = Number(values['timeout-seconds'])
    if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86_400) {
      throw new Error('--timeout-seconds must be an integer from 1 to 86400')
    }
    if (values.submit === Boolean(values.session)) {
      throw new Error('Choose exactly one of --submit or --session')
    }
    if (!values.submit && (values['prompt-file'] || values.base)) {
      throw new Error('--prompt-file and --base are only supported with --submit')
    }
    const task = parseCloudTask(
      values.submit
        ? {
            type: 'submit',
            repository: values.repo,
            base: values.base,
            prompt: values['prompt-file'] ? await readFile(path.resolve(values['prompt-file']), 'utf8') : undefined,
          }
        : {type: 'collect', repository: values.repo, session: values.session},
    )
    const directory = path.resolve(values['output-dir'])
    await mkdir(path.dirname(directory), {recursive: true})
    await mkdir(directory, {mode: 0o700})
    const controller = new AbortController()
    const interrupt = () => {
      controller.abort(new Error('Collection interrupted; remote work has not been cancelled'))
    }
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutSeconds * 1000)])
    try {
      const session = await runCloudTask(task, {
        signal,
        async save(name, content) {
          await writeFile(path.join(directory, name), content, {mode: 0o600})
        },
      })
      console.log(`Session ${session.id}: ${session.state}\n${session.pullRequestUrl}\nArtifacts: ${directory}`)
    } catch (err) {
      await writeFile(
        path.join(directory, 'error.txt'),
        `${err instanceof Error ? err.message : String(err)}\nRemote work is not cancelled. Resume using task.json or submission.txt.\n`,
        {mode: 0o600},
      )
      throw err
    } finally {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', interrupt)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}
