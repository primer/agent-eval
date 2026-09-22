import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {BenchmarkOutput, ExperimentOutput} from '@primer/agent-eval'
import {afterEach, expect, onTestFinished, test, vi} from 'vitest'
import {createBenchmarkOutput, createExperimentOutput, createTrial} from '../test-fixtures'
import {readLocalResults} from './results'
import {createLocalSnapshot, getLocalMedia} from './snapshot'
import {runUi} from '../../runtime.js'

afterEach(() => vi.unstubAllEnvs())

async function directory() {
  const root = path.resolve(`.website-local-test-${randomUUID()}`)
  await fs.mkdir(root)
  onTestFinished(() => fs.rm(root, {recursive: true, force: true}))
  return root
}

async function bundle(root: string, benchmark = false) {
  const output: ExperimentOutput & {capabilities?: BenchmarkOutput['capabilities']} = benchmark
    ? createBenchmarkOutput()
    : createExperimentOutput()
  await fs.mkdir(path.join(root, 'artifacts/trial-1'), {recursive: true})
  await fs.writeFile(path.join(root, 'artifacts/trial-1/trial.json'), JSON.stringify([...output.trials.values()][0]))
  const filepath = path.join(root, 'output.json')
  await fs.writeFile(
    filepath,
    JSON.stringify({
      ...output,
      scenarios: Object.fromEntries(output.scenarios),
      treatments: Object.fromEntries(output.treatments),
      trials: {'trial-1': 'artifacts/trial-1/trial.json'},
      ...('capabilities' in output ? {capabilities: Object.fromEntries(output.capabilities)} : {}),
    }),
  )
  return filepath
}

test.each([false, true])('reads directory and single portable bundle (benchmark=%s)', async benchmark => {
  const root = await directory()
  const filepath = await bundle(root, benchmark)
  const result = await readLocalResults(root)
  expect(result.errors).toEqual([])
  expect(result.runs[0].kind).toBe(benchmark ? 'benchmark' : 'experiment')
  expect(await readLocalResults(filepath)).toEqual(result)
})

test('parses serialized scenario results without importing project configuration', async () => {
  const root = await directory()
  const trial = createTrial()
  await fs.writeFile(path.join(root, 'agent-eval.config.ts'), 'throw new Error("Must not run")')
  await fs.writeFile(
    path.join(root, 'output.json'),
    JSON.stringify({
      id: 'scenario-run',
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
    }),
  )
  const result = await readLocalResults(root)
  expect(result.errors).toEqual([])
  expect(result.runs[0].kind).toBe('scenario')
  expect(result.runs[0].output.trials.get(trial.id)).toEqual(trial)
})

test('discovers additions, updates and deletions and reports malformed bundles', async () => {
  const root = await directory()
  expect((await readLocalResults(root)).runs).toEqual([])
  const filepath = await bundle(root)
  expect((await readLocalResults(root)).runs).toHaveLength(1)
  await fs.writeFile(filepath, '{')
  expect((await readLocalResults(root)).errors).toHaveLength(1)
  await fs.rm(filepath)
  expect(await readLocalResults(root)).toEqual({runs: [], errors: []})
})

test('starts with empty results when the watched directory does not exist yet', async () => {
  const root = await directory()
  expect(await readLocalResults(path.join(root, 'future-results'))).toEqual({runs: [], errors: []})
})

test('fails static export rather than publishing incomplete results', async () => {
  const root = await directory()
  await fs.writeFile(path.join(root, 'output.json'), '{')
  vi.stubEnv('AGENT_EVAL_UI_RESULTS', root)
  vi.stubEnv('AGENT_EVAL_UI_MODE', 'build')
  await expect(createLocalSnapshot()).rejects.toThrow('output.json')
})

test('displays invalid bundle errors without failing development', async () => {
  const root = await directory()
  await fs.writeFile(path.join(root, 'output.json'), '{')
  vi.stubEnv('AGENT_EVAL_UI_RESULTS', root)
  vi.stubEnv('AGENT_EVAL_UI_MODE', 'dev')
  const snapshot = await createLocalSnapshot()
  expect(snapshot.runs).toEqual([])
  expect(snapshot.errors).toEqual([{file: 'output.json', message: expect.any(String)}])
})

test('rejects escaping and symlinked trial paths without reading outside the bundle', async () => {
  const root = await directory()
  const filepath = await bundle(path.join(root, 'bundle'))
  const manifest = JSON.parse(await fs.readFile(filepath, 'utf8'))
  manifest.trials['trial-1'] = '../outside.json'
  await fs.writeFile(path.join(root, 'outside.json'), JSON.stringify(createTrial()))
  await fs.writeFile(filepath, JSON.stringify(manifest))
  expect((await readLocalResults(filepath)).errors[0].message).toContain('outside')
  await fs.symlink(path.join(root, 'outside.json'), path.join(root, 'bundle/link.json'))
  manifest.trials['trial-1'] = 'link.json'
  await fs.writeFile(filepath, JSON.stringify(manifest))
  expect((await readLocalResults(filepath)).errors[0].message).toContain('outside')
})

test('reuses details, transcripts, safe workspace and base-path media rendering', async () => {
  const root = await directory()
  await bundle(root, true)
  vi.stubEnv('AGENT_EVAL_UI_RESULTS', root)
  vi.stubEnv('PAGES_BASE_PATH', '/reports')
  const trial = createTrial({
    capabilityId: 'a',
    walkthrough: {type: 'Screenshot', filepath: 'artifacts/trial-1/walkthrough/image.png'},
    agent: {
      sessions: [
        {
          turns: 1,
          outputTokens: 2,
          premiumRequests: 1,
          totalApiDurationMs: 3,
          sessionDurationMs: 4,
          tools: {},
          messages: [
            {
              type: 'user.message',
              id: 'm',
              timestamp: '',
              parentId: '',
              data: {
                content: 'Build a UI',
                transformedContent: 'Build a UI',
                supportedNativeDocumentMimeTypes: [],
                interactionId: '',
                parentAgentTaskId: '',
              },
            },
          ],
        },
      ],
    },
  } as Parameters<typeof createTrial>[0])
  await fs.mkdir(path.join(root, 'artifacts/trial-1/walkthrough'))
  await fs.mkdir(path.join(root, 'artifacts/trial-1/workspace'))
  await fs.writeFile(path.join(root, 'artifacts/trial-1/walkthrough/image.png'), 'image')
  await fs.writeFile(path.join(root, 'artifacts/trial-1/workspace/index.ts'), 'const value = 1')
  await fs.writeFile(path.join(root, 'artifacts/trial-1/trial.json'), JSON.stringify(trial))
  const snapshot = await createLocalSnapshot()
  expect(snapshot.errors).toEqual([])
  const result = snapshot.runs[0].details.results[0]
  expect(result.capability).toEqual({id: 'a', name: 'First capability'})
  expect(result.workspace.type).toBe('available')
  const details = await (await fetch(result.detailsUrl)).json()
  expect(details.checks[0].check.name).toBe('tests')
  expect(details.judges[0].judge.name).toBe('empty-state-copy')
  expect(details.walkthrough.screenshot).toMatch(/^\/reports\/local-media\/[a-f0-9]+\/media-0.png$/)
  expect(await (await fetch(result.transcriptUrl)).json()).toEqual([
    {id: '0:m', label: 'User', timestamp: '', content: 'Build a UI'},
  ])
  expect((await getLocalMedia()).size).toBe(1)
})

test('refuses overlapping or nonempty output before launching Next', async () => {
  const root = await directory()
  await bundle(root)
  await expect(runUi({mode: 'build', results: root, outputDirectory: path.join(root, 'out')})).rejects.toThrow(
    'overlap',
  )
  await expect(runUi({mode: 'build', results: root, outputDirectory: path.dirname(root)})).rejects.toThrow('overlap')
  const output = await directory()
  await fs.writeFile(path.join(output, 'keep.txt'), 'keep')
  await expect(runUi({mode: 'build', results: root, outputDirectory: output})).rejects.toThrow('empty')
  expect(await fs.readFile(path.join(output, 'keep.txt'), 'utf8')).toBe('keep')
})
