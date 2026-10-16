import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
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

test('@primer/agent-eval publishes the agent docs entrypoint and its references', async () => {
  const directory = path.resolve(import.meta.dirname, '..')
  const {stdout} = await promisify(execFile)('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: directory,
  })
  const [archive]: Array<{files: Array<{path: string}>}> = JSON.parse(stdout)
  const files = archive.files.map(file => file.path)

  expect(files).toContain('docs/AGENTS.md')

  const entrypoint = await fs.readFile(path.join(directory, 'docs/AGENTS.md'), 'utf8')
  const references = [...entrypoint.matchAll(/\]\((references\/[^)#]+\.md)(?:#[^)]*)?\)/g)].map(match => match[1])

  expect(references).toContain('references/getting-started.md')
  expect(references).toContain('references/cli.md')
  for (const reference of references) {
    expect(files).toContain(`docs/${reference}`)
  }
})

test('@primer/agent-eval publishes the built UI without development sources or caches', async () => {
  const directory = path.resolve(import.meta.dirname, '..')
  const {stdout} = await promisify(execFile)('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: directory,
  })
  const [archive]: Array<{files: Array<{path: string}>}> = JSON.parse(stdout)
  const files = archive.files.map(file => {
    return file.path
  })

  expect(files).toContain('dist/ui/.next/BUILD_ID')
  expect(files).toContain('dist/ui/next.config.js')
  expect(
    files.some(file => {
      return file.startsWith('dist/ui/.next/static/') && file.endsWith('.js')
    }),
  ).toBe(true)
  expect(
    files.some(file => {
      return file.startsWith('src/ui/') || file.startsWith('dist/ui/.next/cache/')
    }),
  ).toBe(false)
})
