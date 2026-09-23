import {PassThrough} from 'node:stream'
import {afterEach, beforeEach, expect, test, vi} from 'vitest'
import {logger} from '../logger'
import {createProgressReporter} from './progress'

const originalLevel = logger.level
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  logger.level = originalLevel
  vi.useRealTimers()
})

test('createProgressReporter leaves logs and output unchanged when disabled', () => {
  logger.level = 'debug'
  const stream = createStream()
  using reporter = createProgressReporter(false, stream)

  reporter.update({total: 2, completed: 1, inFlight: 1})

  expect(logger.level).toBe('debug')
  expect(stream.output).toBe('')
})

test('createProgressReporter writes readable redirected progress and restores logging', () => {
  logger.level = 'info'
  const stream = createStream()
  {
    using reporter = createProgressReporter(true, stream)
    expect(logger.level).toBe('warn')
    reporter.update({total: 2, completed: 0, inFlight: 2})
    reporter.update({total: 2, completed: 1, inFlight: 1})
    vi.advanceTimersByTime(2000)
    reporter.update({total: 2, completed: 2, inFlight: 0})
    expect(vi.getTimerCount()).toBe(0)
  }

  expect(stream.output).toContain('Trials: 0/2 (0%) | In flight: 2\n')
  expect(stream.output).toContain('Trials: 1/2 (50%) | In flight: 1\n')
  expect(stream.output).toContain('Trials: 2/2 (100%) | In flight: 0\n')
  expect(stream.output).not.toContain('\x1b')
  expect(logger.level).toBe('info')
})

test('createProgressReporter respects stricter log levels', () => {
  logger.level = 'error'
  using reporter = createProgressReporter(true, createStream())

  reporter.update({total: 0, completed: 0, inFlight: 0})

  expect(logger.level).toBe('error')
})

test('createProgressReporter refreshes in-flight counts before a trial completes', () => {
  const stream = createStream(true)
  using reporter = createProgressReporter(true, stream)

  reporter.update({total: 2, completed: 0, inFlight: 0})
  reporter.update({total: 2, completed: 0, inFlight: 2})
  vi.advanceTimersByTime(1000)

  expect(stream.output).toContain('Trials: 0/2 (0%) | In flight: 2')
})

test('createProgressReporter replaces terminal lines and ends the final line', () => {
  const stream = createStream(true)
  {
    using reporter = createProgressReporter(true, stream)
    reporter.update({total: 2, completed: 0, inFlight: 2})
    reporter.update({total: 2, completed: 2, inFlight: 0})
  }

  expect(stream.output).toContain('Trials: 0/2 (0%) | In flight: 2')
  expect(stream.output).toContain('Trials: 2/2 (100%) | In flight: 0')
  expect(stream.output).toContain('\x1b')
  expect(stream.output.endsWith('\n')).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test('createProgressReporter cleans up terminal output and logging after failure', () => {
  logger.level = 'debug'
  const stream = createStream(true)
  const reporter = createProgressReporter(true, stream)

  expect(() => {
    using progress = reporter
    progress.update({total: 2, completed: 1, inFlight: 1})
    throw new Error('run failed')
  }).toThrow('run failed')
  const output = stream.output
  reporter.update({total: 2, completed: 2, inFlight: 0})
  vi.advanceTimersByTime(2000)

  expect(stream.output).toBe(output)
  expect(stream.output).toContain('Trials: 1/2 (50%) | In flight: 1')
  expect(stream.output.endsWith('\n')).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  expect(logger.level).toBe('debug')
})

test('createProgressReporter reports an empty plan without an invalid percentage', () => {
  const stream = createStream()
  using reporter = createProgressReporter(true, stream)

  reporter.update({total: 0, completed: 0, inFlight: 0})

  expect(stream.output).toContain('Trials: 0/0 (100%) | In flight: 0\n')
  expect(vi.getTimerCount()).toBe(0)
})

function createStream(isTTY = false) {
  const stream = Object.assign(new PassThrough(), {isTTY, output: ''})
  stream.on('data', chunk => {
    stream.output += chunk.toString()
  })
  return stream
}
