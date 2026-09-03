import {expect, test} from 'vitest'
import {deserialize, output, serialize} from './experiment'
import type {TrialResult} from './trial'

test('serializes and deserializes experiment identity and result maps', () => {
  const experimentOutput = output('baseline', [])
  const serialized = serialize(experimentOutput)

  expect(JSON.parse(serialized)).toEqual({
    experimentId: 'baseline',
    scenarios: {},
    treatments: {},
    trials: {},
  })
  expect(deserialize(serialized)).toEqual({
    experimentId: 'baseline',
    scenarios: new Map(),
    treatments: new Map(),
    trials: new Map(),
  })
})

test('creates portable artifact paths relative to the output directory', () => {
  const trialResult: TrialResult = {
    artifacts: {
      directory: '/bundle/artifacts/trial',
      copilotConfigDirectory: '/bundle/artifacts/trial/.copilot',
      skillsConfigDirectory: '/bundle/artifacts/trial/.agents',
      testResultsPath: '/bundle/artifacts/trial/workspace/test-results.json',
      workspaceDirectory: '/bundle/artifacts/trial/workspace',
    },
    trial: {
      id: 'trial',
      scenario: {
        id: 'scenario',
        directory: '/scenarios/scenario',
        prompt: 'Complete the task',
        tags: [],
        testPath: '/scenarios/scenario/scenario.test.ts',
      },
      treatment: {
        name: 'Control',
      },
      model: {
        name: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
      },
    },
    agent: {
      sessions: [],
    },
    testResults: {
      numTotalTests: 1,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      success: true,
      testResults: [],
    },
    walkthrough: {
      type: 'Screenshot',
      filepath: '/bundle/artifacts/trial/walkthrough/screenshot.png',
    },
  }

  const portableOutput = output('baseline', [trialResult], {
    baseDirectory: '/bundle',
  })

  expect(portableOutput.trials.get('trial')).toEqual(
    expect.objectContaining({
      artifacts: {
        directory: 'artifacts/trial',
        copilotConfigDirectory: 'artifacts/trial/.copilot',
        skillsConfigDirectory: 'artifacts/trial/.agents',
        testResultsPath: 'artifacts/trial/workspace/test-results.json',
        workspaceDirectory: 'artifacts/trial/workspace',
      },
      walkthrough: {
        type: 'Screenshot',
        filepath: 'artifacts/trial/walkthrough/screenshot.png',
      },
    }),
  )
})
