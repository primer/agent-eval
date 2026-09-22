import {afterEach, expect, test} from 'vitest'
import {logger} from '../logger'
import {createProgressReporter} from './progress'

const originalLevel = logger.level
afterEach(() => {
  logger.level = originalLevel
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
    reporter.update({total: 2, completed: 2, inFlight: 0})
  }

  expect(stream.output).toBe(
    'Trials: 0/2 (0%) | In flight: 2\nTrials: 1/2 (50%) | In flight: 1\nTrials: 2/2 (100%) | In flight: 0\n',
  )
  expect(logger.level).toBe('info')
})

test('createProgressReporter respects stricter log levels', () => {
  logger.level = 'error'
  using reporter = createProgressReporter(true, createStream())

  reporter.update({total: 0, completed: 0, inFlight: 0})

  expect(logger.level).toBe('error')
})

test('createProgressReporter replaces terminal lines and ends the final line', () => {
  const stream = createStream(true)
  {
    using reporter = createProgressReporter(true, stream)
    reporter.update({total: 2, completed: 0, inFlight: 2})
    reporter.update({total: 2, completed: 2, inFlight: 0})
  }

  expect(stream.output).toBe('\r\x1b[2KTrials: 0/2 (0%) | In flight: 2\r\x1b[2KTrials: 2/2 (100%) | In flight: 0\n')
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
  reporter.update({total: 2, completed: 2, inFlight: 0})

  expect(stream.output).toBe('\r\x1b[2KTrials: 1/2 (50%) | In flight: 1\n')
  expect(logger.level).toBe('debug')
})

test('createProgressReporter reports an empty plan without an invalid percentage', () => {
  const stream = createStream()
  using reporter = createProgressReporter(true, stream)

  reporter.update({total: 0, completed: 0, inFlight: 0})

  expect(stream.output).toBe('Trials: 0/0 (100%) | In flight: 0\n')
})

function createStream(isTTY = false) {
  return {
    isTTY,
    output: '',
    write(text: string) {
      this.output += text
    },
  }
}
