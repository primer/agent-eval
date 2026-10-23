import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, onTestFinished, test} from 'vitest'
import {readBenchmarkOutput, readExperimentOutput} from './result-files'
import {createTrialDetails, getWalkthroughAssets} from './run-details'
import {getWorkspaceFiles} from './workspace-files'
import {createBenchmarkOutput, createExperimentOutput, createTrial} from './test-fixtures'

test.each(['benchmark', 'experiment'] as const)(
  'resolves workspace previews and walkthrough links after moving a relative-path %s bundle',
  async kind => {
    const fixtures = path.resolve('.cache/portable-results-tests')
    await fs.mkdir(fixtures, {recursive: true})
    const directory = await fs.mkdtemp(path.join(fixtures, 'bundle-'))
    onTestFinished(async () => {
      await fs.rm(directory, {recursive: true, force: true})
    })
    const original = path.join(directory, 'original')
    const moved = path.join(directory, 'moved')
    const trial = createTrial({
      artifacts: {
        directory: 'artifacts/trial-1',
        copilotConfigDirectory: 'artifacts/trial-1/copilot',
        skillsConfigDirectory: 'artifacts/trial-1/skills',
        walkthroughDirectory: 'artifacts/trial-1/walkthrough',
        workspaceDirectory: 'artifacts/trial-1/workspace',
      },
      walkthrough: {
        type: 'Screenshot',
        filepath: 'artifacts/trial-1/walkthrough/screenshot.png',
      },
    })
    const output = kind === 'benchmark' ? createBenchmarkOutput([trial]) : createExperimentOutput([trial])
    await fs.mkdir(path.join(original, trial.artifacts.workspaceDirectory), {recursive: true})
    await fs.mkdir(path.join(original, trial.artifacts.walkthroughDirectory), {recursive: true})
    await fs.writeFile(path.join(original, trial.artifacts.workspaceDirectory, 'index.html'), '<h1>Portable</h1>')
    await fs.writeFile(path.join(original, trial.artifacts.walkthroughDirectory, 'screenshot.png'), 'image data')
    await fs.writeFile(
      path.join(original, 'artifacts/trial-1/trial-1.json'),
      JSON.stringify(output.trials.get(trial.id)),
    )
    await fs.writeFile(
      path.join(original, 'output.json'),
      JSON.stringify({
        id: output.id,
        capabilities: Object.fromEntries(output.capabilities),
        scenarios: Object.fromEntries(output.scenarios),
        treatments: Object.fromEntries(output.treatments),
        trials: {
          'trial-1': 'artifacts/trial-1/trial-1.json',
        },
      }),
    )

    await fs.rename(original, moved)
    const read = kind === 'benchmark' ? readBenchmarkOutput : readExperimentOutput
    const bundle = await read(path.join(moved, 'output.json'))
    const relocated = bundle?.trials.get(trial.id)
    if (relocated?.type !== 'success') {
      throw new Error('Expected a successful relocated trial')
    }
    const baseUrl = `/run-data/${kind}s/${output.id}/2026-10-23/${trial.id}`
    const details = await createTrialDetails(relocated, moved, baseUrl)
    expect(details.walkthrough).toEqual({
      type: 'Screenshot',
      screenshot: `${baseUrl}/media-0.png`,
    })
    const {media} = await getWalkthroughAssets(
      relocated.walkthrough,
      moved,
      baseUrl,
      relocated.artifacts.walkthroughDirectory,
    )
    expect(await fs.readFile(media[0].filepath, 'utf8')).toBe('image data')
    const workspace = await getWorkspaceFiles(relocated.artifacts.workspaceDirectory, moved)
    expect(workspace).toMatchObject({
      type: 'available',
      entries: [
        {
          path: 'index.html',
          preview: {
            type: 'text',
            content: '<h1>Portable</h1>',
          },
        },
      ],
    })
    expect(await fs.readdir(directory)).toEqual(['moved'])
  },
)
