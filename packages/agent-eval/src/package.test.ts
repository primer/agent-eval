import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {promisify} from 'node:util'
import {expect, test} from 'vitest'
import * as agentEval from './'
import * as benchmark from './benchmark'
import * as experiment from './experiment'
import * as scenario from './scenario'

test('@primer/agent-eval exports', () => {
  expect(Object.keys(agentEval)).toMatchSnapshot()
})

test('@primer/agent-eval/benchmark exports', () => {
  expect(Object.keys(benchmark)).toMatchSnapshot()
})

test('@primer/agent-eval/experiment exports', () => {
  expect(Object.keys(experiment)).toMatchSnapshot()
})

test('@primer/agent-eval/scenario exports', () => {
  expect(Object.keys(scenario)).toMatchSnapshot()
})

test('the UI loads the built library from a separate generated package scope', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-ui-'))
  const uiDirectory = path.resolve(import.meta.dirname, '../dist/ui')

  try {
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({type: 'module'}))
    await fs.copyFile(path.join(uiDirectory, 'data.js'), path.join(directory, 'data.js'))
    const benchmarksDirectory = path.join(directory, 'benchmarks')
    const experimentsDirectory = path.join(directory, 'experiments')
    const scenariosDirectory = path.join(directory, 'scenarios')
    await Promise.all(
      [benchmarksDirectory, experimentsDirectory, scenariosDirectory].map(directory => {
        return fs.mkdir(directory)
      }),
    )

    const {stdout} = await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const {listBenchmarks, listExperiments, listScenarios} = await import(process.argv[1])
         const benchmarks = await listBenchmarks({
           benchmarksDirectory: process.argv[2],
           scenariosDirectory: process.argv[4],
         })
         const experiments = await listExperiments({
           benchmarksDirectory: process.argv[2],
           experimentsDirectory: process.argv[3],
           scenariosDirectory: process.argv[4],
         })
         const scenarios = await listScenarios({directory: process.argv[4]})
         console.log(JSON.stringify({benchmarks, experiments, scenarios}))`,
        pathToFileURL(path.join(directory, 'data.js')).href,
        benchmarksDirectory,
        experimentsDirectory,
        scenariosDirectory,
      ],
      {
        cwd: uiDirectory,
      },
    )

    expect(JSON.parse(stdout)).toEqual({
      benchmarks: [],
      experiments: [],
      scenarios: [],
    })
  } finally {
    await fs.rm(directory, {
      recursive: true,
      force: true,
    })
  }
})

test('@primer/agent-eval publishes its docs and UI without Next.js build caches', async () => {
  const directory = path.resolve(import.meta.dirname, '..')
  const {stdout} = await promisify(execFile)('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: directory,
    timeout: 10_000,
  })
  const [archive]: Array<{files: Array<{path: string}>}> = JSON.parse(stdout)
  const files = archive.files.map(file => {
    return file.path
  })

  expect(files).toContain('docs/AGENTS.md')
  expect(files).toContain('dist/ui/app/page.js')
  expect(files).toContain('dist/ui/data.js')
  expect(
    files.some(file => {
      return file.includes('/.next/')
    }),
  ).toBe(false)

  const entrypoint = await fs.readFile(path.join(directory, 'docs/AGENTS.md'), 'utf8')
  const references = [...entrypoint.matchAll(/\]\((references\/[^)#]+\.md)(?:#[^)]*)?\)/g)].map(match => {
    return match[1]
  })

  expect(references).toContain('references/getting-started.md')
  expect(references).toContain('references/cli.md')
  for (const reference of references) {
    expect(files).toContain(`docs/${reference}`)
  }
}, 15_000)
