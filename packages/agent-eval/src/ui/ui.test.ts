import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {expect, onTestFinished, test} from 'vitest'
import {runCommand} from 'citty'
import {ui} from '../cli/commands/ui'
import type {ExperimentTrialOutput} from '../experiment/output'
import {readResults} from './results'
import {renderPage} from './page'
import {buildUi, startUi} from './server'

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-ui-'))
  onTestFinished(async () => {
    await fs.rm(directory, {recursive: true, force: true})
  })
  return directory
}

function createTrial(): ExperimentTrialOutput {
  return {
    id: 'trial-1',
    scenarioId: 'example',
    treatmentId: 'control',
    model: {name: 'gpt-5.6-sol', reasoningEffort: 'medium'},
    agent: {sessions: []},
    artifacts: {
      directory: 'artifacts/trial-1',
      copilotConfigDirectory: 'artifacts/trial-1/copilot',
      skillsConfigDirectory: 'artifacts/trial-1/skills',
      walkthroughDirectory: 'artifacts/trial-1/walkthrough',
      workspaceDirectory: 'artifacts/trial-1/workspace',
    },
    checks: [
      {
        check: {name: 'tests', files: []},
        result: {type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed'}]},
      },
    ],
    judges: [],
    walkthrough: {type: 'Unavailable'},
  }
}

async function writeBundle(directory: string, kind = 'experiment', trialPath = 'artifacts/trial-1/trial-1.json') {
  const trial = createTrial()
  await fs.mkdir(path.join(directory, 'artifacts/trial-1'), {recursive: true})
  await fs.writeFile(
    path.join(directory, 'artifacts/trial-1/trial-1.json'),
    JSON.stringify({...trial, ...(kind === 'benchmark' ? {capabilityId: 'capability'} : {})}),
  )
  const output =
    kind === 'scenario'
      ? {
          id: 'example',
          results: [
            {
              trial: {id: trial.id},
              result: {
                ...trial,
                trial: {
                  id: trial.id,
                  model: trial.model,
                  scenario: {id: trial.scenarioId},
                  treatment: {id: trial.treatmentId},
                },
              },
            },
          ],
        }
      : {
          id: kind,
          scenarios: {
            example: {id: 'example', directory: '/example', prompt: 'Example', tags: [], judges: []},
          },
          treatments: {control: {id: 'control', name: 'Control'}},
          trials: {[trial.id]: trialPath},
          ...(kind === 'benchmark'
            ? {capabilities: {capability: {id: 'capability', name: 'Capability', scenarioIds: ['example']}}}
            : {}),
        }
  await fs.writeFile(path.join(directory, 'output.json'), JSON.stringify(output))
}

test.each(['benchmark', 'experiment', 'scenario'])(
  'reads and renders a %s result bundle without modifying it',
  async kind => {
    const directory = await temporaryDirectory()
    await writeBundle(directory, kind)
    const before = await fs.readFile(path.join(directory, 'output.json'), 'utf8')
    const results = await readResults(directory)
    expect(results.errors).toEqual([])
    expect(results.runs).toMatchObject([{kind, trials: [{id: 'trial-1', scenarioId: 'example'}]}])
    const page = renderPage(results)
    expect(page).toContain('gpt-5.6-sol')
    expect(page).toContain('passed')
    expect(page).toContain('Full trial result')
    expect(await fs.readFile(path.join(directory, 'output.json'), 'utf8')).toBe(before)
  },
)

test('discovers nested runs and shards but not artifacts or symlinked directories', async () => {
  const directory = await temporaryDirectory()
  await writeBundle(path.join(directory, 'experiments/example/date'))
  await writeBundle(path.join(directory, 'benchmarks/example/date'), 'benchmark')
  await writeBundle(path.join(directory, 'artifacts/ignored'))
  await fs.rename(
    path.join(directory, 'benchmarks/example/date/output.json'),
    path.join(directory, 'benchmarks/example/date/output-1.json'),
  )
  await fs.symlink(path.join(directory, 'experiments'), path.join(directory, 'linked'))
  const results = await readResults(directory)
  expect(results.runs).toHaveLength(2)
  expect(results.runs[0].file).toBe(path.join('benchmarks/example/date/output-1.json'))
})

test.each(['../outside.json', '/outside.json', 'linked.json'])('rejects trial path %s', async trialPath => {
  const directory = await temporaryDirectory()
  const bundle = path.join(directory, 'bundle')
  await writeBundle(bundle, 'experiment', trialPath)
  await fs.writeFile(path.join(directory, 'outside.json'), JSON.stringify(createTrial()))
  await fs.symlink(path.join(directory, 'outside.json'), path.join(bundle, 'linked.json'))
  const results = await readResults(bundle)
  expect(results.runs).toEqual([])
  expect(results.errors).toHaveLength(1)
  expect(results.errors[0].message).toMatch(/inside the result bundle|bundle-relative/)
})

test('reports incomplete, invalid, and mismatched trial data without hiding valid runs', async () => {
  const directory = await temporaryDirectory()
  await writeBundle(path.join(directory, 'good'))
  const bad = path.join(directory, 'bad')
  await writeBundle(bad)
  const trialPath = path.join(bad, 'artifacts/trial-1/trial-1.json')
  for (const data of ['{', '{}', JSON.stringify({...createTrial(), id: 'wrong'})]) {
    await fs.writeFile(trialPath, data)
    const results = await readResults(directory)
    expect(results.runs).toHaveLength(1)
    expect(results.errors).toHaveLength(1)
  }
  await fs.rm(trialPath)
  expect((await readResults(directory)).errors).toHaveLength(1)
  await expect(buildUi(directory, path.join(await temporaryDirectory(), 'out'))).rejects.toThrow()
})

test('escapes result text and creates a self-contained static site through the command', async () => {
  const directory = await temporaryDirectory()
  const resultsDirectory = path.join(directory, 'results')
  await writeBundle(resultsDirectory)
  const trial = {...createTrial(), id: 'trial-1', scenarioId: '</summary><script>alert(1)</script>'}
  await fs.writeFile(path.join(resultsDirectory, 'artifacts/trial-1/trial-1.json'), JSON.stringify(trial))
  const output = path.join(directory, 'site')
  await runCommand(ui, {rawArgs: ['build', '--results', resultsDirectory, '--output-dir', output]})
  const html = await fs.readFile(path.join(output, 'index.html'), 'utf8')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toMatch(/(?:src|href)=["']/)
  expect(await fs.readFile(path.join(output, '.nojekyll'), 'utf8')).toBe('')
})

test('rejects overlapping build destinations, including symlinks', async () => {
  const directory = await temporaryDirectory()
  const results = path.join(directory, 'results')
  await writeBundle(results)
  await fs.symlink(results, path.join(directory, 'linked'))
  for (const output of [results, path.join(results, 'site'), directory, path.join(directory, 'linked/site')]) {
    await expect(buildUi(results, output)).rejects.toThrow('must not overlap')
  }
  await expect(buildUi(path.join(directory, 'missing'), path.join(directory, 'out'))).rejects.toThrow()
})

test('dev serves new, changed, and removed results without restarting and confines HTTP access', async () => {
  const directory = path.join(await temporaryDirectory(), 'results')
  const server = await startUi(directory, '0')
  onTestFinished(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
      server.closeAllConnections()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server')
  }
  const url = `http://127.0.0.1:${address.port}`
  expect(await (await fetch(url)).text()).toContain('No results found')
  const initial = await (await fetch(`${url}/__revision`)).text()
  await writeBundle(directory)
  const added = await (await fetch(`${url}/__revision`)).text()
  expect(added).not.toBe(initial)
  expect(await (await fetch(url)).text()).toContain('gpt-5.6-sol')
  await fs.writeFile(
    path.join(directory, 'artifacts/trial-1/trial-1.json'),
    JSON.stringify({...createTrial(), treatmentId: 'updated'}),
  )
  expect(await (await fetch(`${url}/__revision`)).text()).not.toBe(added)
  expect(await (await fetch(url)).text()).toContain('updated')
  await fs.rm(path.join(directory, 'output.json'))
  expect(await (await fetch(`${url}/__revision`)).text()).toBe(initial)
  expect((await fetch(`${url}/artifacts/trial-1/trial-1.json`)).status).toBe(404)
  expect((await fetch(url, {method: 'POST'})).status).toBe(405)
  const untrustedStatus = await new Promise<number | undefined>((resolve, reject) => {
    http
      .get(url, {headers: {Host: 'untrusted.example'}}, response => {
        response.resume()
        resolve(response.statusCode)
      })
      .on('error', reject)
  })
  expect(untrustedStatus).toBe(403)
  const malformedStatus = await new Promise<number | undefined>((resolve, reject) => {
    http
      .get(url, {path: '//['}, response => {
        response.resume()
        resolve(response.statusCode)
      })
      .on('error', reject)
  })
  expect(malformedStatus).toBe(404)
  expect((await fetch(url, {method: 'HEAD'})).headers.get('cache-control')).toBe('no-store')
  await expect(startUi(directory, String(address.port))).rejects.toThrow('EADDRINUSE')
})

test.each(['-1', '65536', 'abc', '1.5', ''])('rejects invalid port %s', async port => {
  await expect(startUi(await temporaryDirectory(), port)).rejects.toThrow()
})
