import {runCommand} from 'citty'
import {afterEach, expect, test, vi} from 'vitest'
import {getScenario} from '../scenario/get'
import {listScenarios} from '../scenario/list'
import {buildScenarioImage} from '../scenario/image'
import {scenario} from './commands/scenario'

vi.mock('../scenario/get', () => {
  return {getScenario: vi.fn()}
})
vi.mock('../scenario/list', () => {
  return {listScenarios: vi.fn()}
})
vi.mock('../scenario/image', () => {
  return {buildScenarioImage: vi.fn()}
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

const fixture = {
  id: 'example',
  directory: '/scenarios/example',
  prompt: 'Update the app',
  tags: [],
  checks: [],
  judges: [],
}

test('builds one scenario without a token or agent session and prints its image', async () => {
  vi.mocked(getScenario).mockResolvedValue(fixture)
  vi.mocked(buildScenarioImage).mockResolvedValue('agent-eval-scenario:built')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})

  await runCommand(scenario, {
    rawArgs: ['build', 'example', '--scenarios', '/scenarios', '--docker-image', 'node:custom'],
  })

  expect(getScenario).toHaveBeenCalledWith({directory: '/scenarios', name: 'example'})
  expect(listScenarios).not.toHaveBeenCalled()
  expect(buildScenarioImage).toHaveBeenCalledWith({scenario: fixture, dockerImage: 'node:custom'})
  expect(log).toHaveBeenCalledWith(JSON.stringify({scenario: 'example', image: 'agent-eval-scenario:built'}))
})

test('builds all discovered scenarios when no name is provided', async () => {
  vi.mocked(listScenarios).mockResolvedValue([fixture, {...fixture, id: 'second'}])
  vi.mocked(buildScenarioImage).mockResolvedValue('agent-eval-scenario:built')
  vi.spyOn(console, 'log').mockImplementation(() => {})

  await runCommand(scenario, {rawArgs: ['build', '--scenarios', '/scenarios']})

  expect(listScenarios).toHaveBeenCalledWith({directory: '/scenarios'})
  expect(buildScenarioImage).toHaveBeenCalledTimes(2)
})

test('fails explicitly when no scenarios are found', async () => {
  vi.mocked(listScenarios).mockResolvedValue([])
  await expect(runCommand(scenario, {rawArgs: ['build', '--scenarios', '/scenarios']})).rejects.toThrow(
    'No scenarios found',
  )
  expect(buildScenarioImage).not.toHaveBeenCalled()
})

test('propagates build failures instead of printing a successful image', async () => {
  vi.mocked(getScenario).mockResolvedValue(fixture)
  const error = new Error('Docker build failed')
  vi.mocked(buildScenarioImage).mockRejectedValue(error)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})

  await expect(runCommand(scenario, {rawArgs: ['build', 'example']})).rejects.toBe(error)
  expect(log).not.toHaveBeenCalled()
})
