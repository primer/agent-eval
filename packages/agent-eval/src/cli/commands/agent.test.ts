import {expect, test} from 'vitest'
import {agent} from './agent'

test('agent command provides setup', () => {
  expect(Object.keys(agent.subCommands ?? {})).toEqual(['setup'])
})
