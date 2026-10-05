import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import type {RunPlanResult} from '../plan'
import {getExperiment} from './get'
import {createExperimentOutput, ExperimentOutputFileSchema, writeExperimentOutput} from './output'
import {createExperimentPlan, type ExperimentTrial} from './plan'
import {createExperimentReport} from './report'

test('experiment outputs and reports preserve scenario names while referencing hashed IDs', async () => {
  const host = VirtualHost.create({
    '/experiments/example.ts': `export default {
      name: 'Example experiment',
      description: 'Example',
      models: ['gpt-5.5'],
      scenarios: ['example'],
      treatments: [],
    }`,
    '/scenarios/example/package.json': '{}',
    '/scenarios/example/scenario.config.ts': 'export default {prompt: "Create a page"}',
  })
  const experiment = await getExperiment({
    host,
    experimentsDirectory: '/experiments',
    scenariosDirectory: '/scenarios',
    name: 'example',
  })
  const {trials} = createExperimentPlan({experiment})
  const trial = {...trials[0], id: 'trial'}
  const runPlanResult: RunPlanResult<ExperimentTrial> = {
    results: [
      {
        trial,
        result: {
          trial,
          agent: {sessions: []},
          artifacts: {
            directory: '/output/artifacts/trial',
            copilotConfigDirectory: '/output/artifacts/trial/copilot',
            skillsConfigDirectory: '/output/artifacts/trial/skills',
            walkthroughDirectory: '/output/artifacts/trial/walkthrough',
            workspaceDirectory: '/output/artifacts/trial/workspace',
          },
          checks: [],
          judges: [],
          walkthrough: {type: 'Unavailable'},
        },
      },
    ],
  }

  const output = createExperimentOutput({experiment, runPlanResult})
  await writeExperimentOutput({host, output, outputPath: '/output/output.json'})
  const manifest = ExperimentOutputFileSchema.parse(JSON.parse(await host.fs.readFile('/output/output.json', 'utf8')))
  const savedTrial = JSON.parse(await host.fs.readFile('/output/artifacts/trial/trial.json', 'utf8'))
  const report = createExperimentReport({experiment, runPlanResult})

  expect(Object.keys(manifest.scenarios)).toEqual(['2770381665'])
  expect(manifest.scenarios['2770381665']).toMatchObject({id: '2770381665', name: 'example'})
  expect(savedTrial.scenarioId).toBe('2770381665')
  expect(report).toContain('  example')
  expect(report).not.toContain('2770381665')
})
