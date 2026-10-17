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
