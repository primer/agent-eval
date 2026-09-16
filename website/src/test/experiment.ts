import type {ExperimentTrialOutput} from '@primer/agent-eval'
import type {Run} from '../runs'
import {createExperimentOutput, createTrial, session} from '../test-fixtures'

export function createResult(overrides: Partial<ExperimentTrialOutput> = {}): ExperimentTrialOutput {
  return createTrial({
    scenarioId: 'scenario-a',
    agent: {
      sessions: [{...session, totalApiDurationMs: 1000, sessionDurationMs: 2000}],
    },
    checks: [
      {
        check: {name: 'tests', files: []},
        result: {
          type: 'outcomes',
          outcomes: [
            {type: 'outcome', status: 'passed'},
            {type: 'outcome', status: 'passed'},
            {type: 'outcome', status: 'passed'},
            {type: 'outcome', status: 'failed'},
          ],
        },
      },
    ],
    judges: [],
    ...overrides,
  })
}

export function createRun(results: Array<ExperimentTrialOutput> = [createResult()], date = '2026-09-10'): Run {
  return {
    id: date,
    experimentId: 'example',
    name: date,
    date: new Date(`${date}T00:00:00.000Z`),
    directory: `/results/experiments/example/${date}`,
    output: {
      ...createExperimentOutput(results),
      id: 'example',
      scenarios: new Map(
        ['scenario-b', 'scenario-a'].map(id => {
          return [id, {id, directory: `/scenarios/${id}`, prompt: 'Build a page', tags: [], judges: []}]
        }),
      ),
      treatments: new Map([
        ['control', {id: 'control', name: 'Control'}],
        ['skill', {id: 'skill', name: 'With skill'}],
      ]),
    },
  }
}
