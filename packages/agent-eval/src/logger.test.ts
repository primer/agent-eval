import {describe, expect, test} from 'vitest'
import {getDefaultLogLevel, Logger, parseLogLevel} from './logger'

describe('Logger', () => {
  test('filters messages below the configured level and formats output', () => {
    const stdout: Array<string> = []
    const stderr: Array<string> = []
    const logger = new Logger({
      level: 'info',
      stdout: message => stdout.push(message),
      stderr: message => stderr.push(message),
    })

    logger.debug('hidden')
    logger.info('Running %s', 'experiment')
    logger.warn('Retrying after error: %s', 'failed')
    logger.error('Unable to continue')

    expect(stdout).toEqual(['[INFO] Running experiment\n'])
    expect(stderr).toEqual(['[WARN] Retrying after error: failed\n', '[ERROR] Unable to continue\n'])
  })

  test('allows the level to be changed', () => {
    const stdout: Array<string> = []
    const logger = new Logger({
      level: 'info',
      stdout: message => stdout.push(message),
    })

    logger.debug('hidden')
    logger.setLevel('debug')
    logger.debug('visible')

    expect(stdout).toEqual(['[DEBUG] visible\n'])
  })
})

describe('parseLogLevel', () => {
  test.each(['debug', 'info', 'warn', 'error'] as const)('accepts %s', level => {
    expect(parseLogLevel(level)).toBe(level)
  })

  test('rejects unknown levels', () => {
    expect(() => parseLogLevel('verbose')).toThrow(
      'Invalid log level "verbose". Expected one of: debug, info, warn, error',
    )
  })
})

describe('getDefaultLogLevel', () => {
  test('defaults to info', () => {
    expect(getDefaultLogLevel({})).toBe('info')
  })

  test('uses debug when GitHub Actions runner debug logging is enabled', () => {
    expect(getDefaultLogLevel({RUNNER_DEBUG: '1'})).toBe('debug')
    expect(getDefaultLogLevel({ACTIONS_STEP_DEBUG: 'true'})).toBe('debug')
  })
})
