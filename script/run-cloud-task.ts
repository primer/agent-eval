import {randomUUID} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {parseArgs} from 'node:util'
import {
  parseCloudTask,
  parseCloudRequest,
  resolveCloudRequest,
  runCloudTask,
  runGh,
  downloadCloudResults,
} from '../packages/agent-eval/src/copilot-cloud.ts'

const {values} = parseArgs({
  options: {
    submit: {type: 'boolean', default: false},
    repo: {type: 'string'},
    base: {type: 'string'},
    kind: {type: 'string'},
    name: {type: 'string'},
    'results-release': {type: 'string'},
    'export-bundle': {type: 'boolean', default: false},
    'task-file': {type: 'string'},
    session: {type: 'string'},
    'output-dir': {type: 'string'},
    'timeout-seconds': {type: 'string', default: '3600'},
    help: {type: 'boolean', default: false},
  },
})

if (values.help) {
  console.log(`Repository-only whole evaluation cloud prototype (creates a PR and consumes quota).
Submit:
  node script/run-cloud-task.ts --submit --repo OWNER/REPO --base BRANCH --kind benchmark|experiment|scenario --name ID --results-release EXISTING_DRAFT_TAG --output-dir DIR
Resume collection without submitting:
  node script/run-cloud-task.ts --task-file DIR/task.json --output-dir NEW_DIR
Ambiguous submission: use request.json as --task-file plus --session UUID.
--export-bundle  Explicitly authorize sensitive full result bundle export to the draft release.
                 Publishing the release later may make its assets public.
                 Default: execution status only; full results remain in the cloud session.
--timeout-seconds N  Local collection timeout and initial remote evaluation deadline (default 3600).
Collection downloads immutable run-specific assets, never extracts archives.
Timeout/interrupt does not cancel remote work. Never automatically resubmit.`)
} else {
  try {
    if (!values['output-dir']) throw new Error('--output-dir is required and must be fresh')
    const timeoutSeconds = Number(values['timeout-seconds'])
    if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86_400) {
      throw new Error('--timeout-seconds must be an integer from 1 to 86400')
    }
    if (values.submit === Boolean(values['task-file'])) throw new Error('Choose --submit or --task-file')
    if (
      !values.submit &&
      (values.repo || values.base || values.kind || values.name || values['results-release'] || values['export-bundle'])
    ) {
      throw new Error('Collection uses the saved request; submission options are not allowed')
    }
    if (values.submit && values.session) throw new Error('--session is only for ambiguous submission recovery')
    const directory = path.resolve(values['output-dir'])
    await mkdir(path.dirname(directory), {recursive: true})
    await mkdir(directory, {mode: 0o700})
    const controller = new AbortController()
    const interrupt = () => controller.abort(new Error('Collection interrupted; remote work has not been cancelled'))
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutSeconds * 1000)])
    try {
      let task
      if (values.submit) {
        if (!values.base) throw new Error('--base is required')
        const commit = JSON.parse(
          await runGh(['api', `repos/${values.repo}/commits/${encodeURIComponent(values.base)}`], {signal}),
        ) as {sha?: string; commit?: {tree?: {sha?: string}}}
        task = parseCloudTask({
          type: 'submit',
          base: values.base,
          request: await resolveCloudRequest(
            {
              repository: values.repo,
              runId: randomUUID(),
              kind: values.kind,
              name: values.name,
              release: values['results-release'],
              commit: commit.sha,
              tree: commit.commit?.tree?.sha,
              deadline: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
              exportBundle: values['export-bundle'],
            },
            signal,
          ),
        })
      } else {
        const saved: unknown = JSON.parse(await readFile(path.resolve(values['task-file']!), 'utf8'))
        task = values.session
          ? parseCloudTask({type: 'collect', request: parseCloudRequest(saved), session: values.session})
          : parseCloudTask(saved)
        if (task.type !== 'collect') throw new Error('Resume requires a saved collection task')
      }
      const session = await runCloudTask(task, {
        signal,
        async save(name, content) {
          await writeFile(path.join(directory, name), content, {mode: 0o600})
        },
        async download(request, downloadSignal) {
          return downloadCloudResults(request, directory, {
            signal: downloadSignal,
            read: name => readFile(path.join(directory, name), 'utf8'),
          })
        },
      })
      console.log(`Session ${session.id}: ${session.state}\nEvaluation status and assets: ${directory}`)
    } catch (err) {
      await writeFile(
        path.join(directory, 'error.txt'),
        'Evaluation/collection failed. Retained evidence is in this directory. Remote work is not cancelled. Resume from task.json or request.json plus --session; do not resubmit.\n',
        {mode: 0o600},
      )
      throw err
    } finally {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', interrupt)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : 'Cloud evaluation failed')
    process.exitCode = 1
  }
}
