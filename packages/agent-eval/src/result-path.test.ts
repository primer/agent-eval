import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, onTestFinished, test} from 'vitest'
import {
  BenchmarkOutputFileSchema,
  BenchmarkTrialOutputSchema,
  listBenchmarkOutputFiles,
  mergeBenchmarkOutputFiles,
  writeBenchmarkOutput,
  type BenchmarkOutput,
  type BenchmarkTrialOutput,
} from './benchmark/output'
import {listExperimentOutputFiles, mergeExperimentOutputFiles, writeExperimentOutput} from './experiment/output'

test.each(['benchmark', 'experiment'] as const)(
  'relocates a written %s bundle, merges its shard, and preserves portable paths on a second write',
  async kind => {
    const fixtures = path.resolve('.cache/result-path-tests')
    await fs.mkdir(fixtures, {recursive: true})
    const directory = await fs.mkdtemp(path.join(fixtures, 'bundle-'))
    onTestFinished(async () => {
      await fs.rm(directory, {recursive: true, force: true})
    })
    const original = path.join(directory, 'original')
    const moved = path.join(directory, 'moved')
    const artifactsDirectory = path.join(original, 'artifacts/trial')
    const trial = BenchmarkTrialOutputSchema.parse({
      id: 'trial',
      capabilityId: 'components',
      scenarioId: 'example',
      treatmentId: 'control',
      model: {
        name: 'gpt-5.5',
        reasoningEffort: 'medium',
      },
      agent: {sessions: []},
      artifacts: {
        directory: artifactsDirectory,
        copilotConfigDirectory: path.join(original, 'artifacts/configuration/copilot'),
        skillsConfigDirectory: path.join(original, 'artifacts/configuration/skills'),
        walkthroughDirectory: path.join(original, 'artifacts/captured/trial'),
        workspaceDirectory: path.join(original, 'artifacts/workspaces/trial'),
      },
      judges: [],
      walkthrough: {
        type: 'Screenshots',
        screenshots: ['walkthrough/first.png', path.join(original, 'artifacts/captured/trial/second.png')],
      },
    })
    if (trial.type !== 'success') {
      throw new Error('Expected a successful trial')
    }
    for (const artifact of Object.values(trial.artifacts)) {
      await fs.mkdir(artifact, {recursive: true})
    }
    await fs.writeFile(path.join(trial.artifacts.workspaceDirectory, 'index.html'), '<h1>Portable</h1>')
    await fs.writeFile(path.join(trial.artifacts.walkthroughDirectory, 'first.png'), 'first image')
    await fs.writeFile(path.join(trial.artifacts.walkthroughDirectory, 'second.png'), 'second image')
    const output: BenchmarkOutput = {
      id: 'example',
      capabilities: new Map([['components', {id: 'components', name: 'Components', scenarioIds: ['example']}]]),
      scenarios: new Map([
        ['example', {id: 'example', directory: '/scenarios/example', prompt: 'Build a page', tags: [], judges: []}],
      ]),
      treatments: new Map([['control', {id: 'control', name: 'Control'}]]),
      trials: new Map<string, BenchmarkTrialOutput>([
        [trial.id, trial],
        [
          'failed',
          {
            type: 'error',
            id: 'failed',
            capabilityId: 'components',
            scenarioId: 'example',
            treatmentId: 'control',
            runner: 'copilot-cli',
            model: trial.model,
            error: {name: 'Error', message: 'Sandbox failed'},
          },
        ],
      ]),
    }
    const write = kind === 'benchmark' ? writeBenchmarkOutput : writeExperimentOutput
    await write({output, outputPath: path.join(original, 'output-1.json')})
    const persisted = JSON.parse(await fs.readFile(path.join(artifactsDirectory, 'trial.json'), 'utf8'))
    expect(Object.values(persisted.artifacts)).toEqual([
      'artifacts/trial',
      'artifacts/configuration/copilot',
      'artifacts/configuration/skills',
      'artifacts/captured/trial',
      'artifacts/workspaces/trial',
    ])
    expect(persisted.walkthrough).toEqual({
      type: 'Screenshots',
      screenshots: ['artifacts/captured/trial/first.png', 'artifacts/captured/trial/second.png'],
    })
    expect(trial.walkthrough).toEqual({
      type: 'Screenshots',
      screenshots: ['walkthrough/first.png', path.join(original, 'artifacts/captured/trial/second.png')],
    })

    await fs.rename(original, moved)
    const list = kind === 'benchmark' ? listBenchmarkOutputFiles : listExperimentOutputFiles
    const files = await list({outputDirectory: moved})
    const options = {
      outputDirectory: moved,
      outputs: files.map(([file]) => {
        return file
      }),
    }
    const merged =
      kind === 'benchmark' ? await mergeBenchmarkOutputFiles(options) : await mergeExperimentOutputFiles(options)
    const relocated = merged.trials.get('trial')
    if (relocated?.type !== 'success' || relocated.walkthrough.type !== 'Screenshots') {
      throw new Error('Expected relocated screenshots')
    }
    for (const artifact of Object.values(relocated.artifacts)) {
      expect((await fs.stat(artifact)).isDirectory()).toBe(true)
      expect(path.relative(moved, artifact).startsWith('artifacts/')).toBe(true)
    }
    expect(await fs.readFile(path.join(relocated.artifacts.workspaceDirectory, 'index.html'), 'utf8')).toBe(
      '<h1>Portable</h1>',
    )
    expect(
      await Promise.all(
        relocated.walkthrough.screenshots.map(filepath => {
          return fs.readFile(filepath, 'utf8')
        }),
      ),
    ).toEqual(['first image', 'second image'])
    expect(merged.trials.get('failed')).toEqual(output.trials.get('failed'))

    if (kind === 'benchmark') {
      await writeBenchmarkOutput({
        output: await mergeBenchmarkOutputFiles(options),
        outputPath: path.join(moved, 'output.json'),
      })
    } else {
      await writeExperimentOutput({
        output: merged,
        outputPath: path.join(moved, 'output.json'),
      })
    }
    const manifest = BenchmarkOutputFileSchema.parse(
      JSON.parse(await fs.readFile(path.join(moved, 'output.json'), 'utf8')),
    )
    expect(JSON.parse(await fs.readFile(path.join(moved, manifest.trials.trial), 'utf8'))).toEqual(persisted)
    expect(await fs.readdir(directory)).toEqual(['moved'])

    for (const type of ['Screenshot', 'Video'] as const) {
      await fs.writeFile(
        path.join(moved, manifest.trials.trial),
        JSON.stringify({
          ...relocated,
          walkthrough: {
            type,
            filepath: 'walkthrough/first.png',
          },
        }),
      )
      const legacy =
        kind === 'benchmark' ? await mergeBenchmarkOutputFiles(options) : await mergeExperimentOutputFiles(options)
      const legacyTrial = legacy.trials.get('trial')
      if (legacyTrial?.type !== 'success') {
        throw new Error('Expected a successful legacy trial')
      }
      expect(legacyTrial.artifacts).toEqual(relocated.artifacts)
      expect(legacyTrial.walkthrough).toEqual({
        type,
        filepath: path.join(moved, 'artifacts/captured/trial/first.png'),
      })
      await writeExperimentOutput({
        output: legacy,
        outputPath: path.join(moved, 'output.json'),
      })
      const rewritten = JSON.parse(await fs.readFile(path.join(moved, manifest.trials.trial), 'utf8'))
      expect(rewritten.walkthrough).toEqual({
        type,
        filepath: 'artifacts/captured/trial/first.png',
      })
    }
  },
)
