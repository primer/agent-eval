import {randomUUID} from 'node:crypto'
import {afterEach, expect, test, vi} from 'vitest'
import {containerLabels, isRecoverableContainer, parseRunId, recoveryFilters} from './container-ownership'

afterEach(() => {
  vi.restoreAllMocks()
})

test('labels containers with run, trial, and local process ownership', () => {
  const runId = randomUUID()
  const labels = containerLabels(runId, 'trial')
  expect(labels['io.primer.agent-eval.run']).toBe(runId)
  expect(labels['io.primer.agent-eval.trial']).toBe('trial')
  expect(labels['io.primer.agent-eval.pid']).toBe(String(process.pid))
  for (const filter of recoveryFilters(runId)) {
    const [key, value] = filter.split('=')
    expect(labels[key]).toBe(value)
  }
})

test('only recovers an exact run whose owning process is confirmed absent', () => {
  const runId = randomUUID()
  const labels = containerLabels(runId)
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('Missing'), {code: 'ESRCH'})
  })
  expect(isRecoverableContainer({...labels, 'io.primer.agent-eval.owner': 'other'}, runId)).toBe(false)
  expect(isRecoverableContainer(labels, randomUUID())).toBe(false)
  expect(kill).not.toHaveBeenCalled()
  expect(isRecoverableContainer(labels, runId)).toBe(true)
  expect(kill).toHaveBeenCalledWith(process.pid, 0)
})

test('never recovers live processes or those we cannot inspect', () => {
  const runId = randomUUID()
  const labels = containerLabels(runId)
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  expect(isRecoverableContainer(labels, runId)).toBe(false)
  kill.mockImplementation(() => {
    throw Object.assign(new Error('Not permitted'), {code: 'EPERM'})
  })
  expect(isRecoverableContainer(labels, runId)).toBe(false)
  kill.mockImplementation(() => {
    throw new Error('Unexpected process lookup error')
  })
  expect(() => {
    isRecoverableContainer(labels, runId)
  }).toThrow('Unexpected process lookup error')
})

test.each(['0', '-1', 'invalid', '', '123abc', '2147483648'])('rejects unsafe owner PID %s', pid => {
  const runId = randomUUID()
  const kill = vi.spyOn(process, 'kill')
  expect(() => {
    isRecoverableContainer({...containerLabels(runId), 'io.primer.agent-eval.pid': pid}, runId)
  }).toThrow()
  expect(kill).not.toHaveBeenCalled()
})

test('rejects invalid run IDs', () => {
  expect(() => {
    parseRunId('not-a-run')
  }).toThrow()
})
