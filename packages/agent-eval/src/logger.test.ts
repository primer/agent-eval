import pino, {type LogFn} from 'pino'
import {describe, expect, expectTypeOf, test, vi} from 'vitest'
import {debug, error, fatal, getLogger, info, span, trace, warn, withLogger} from './logger'

describe('getLogger', () => {
  test('returns the default logger disabled during tests', () => {
    const {logger} = getLogger()

    expect(logger.level).toBe('silent')
    expect(logger.isLevelEnabled('info')).toBe(false)
  })
})

describe('withLogger', () => {
  test('uses the scoped logger and returns the callback result', () => {
    const previous = getLogger()
    const context = {
      logger: pino({enabled: false}),
    }

    const result = withLogger(context, () => {
      expect(getLogger()).toBe(context)
      return 'result'
    })

    expect(result).toBe('result')
    expect(getLogger()).toBe(previous)
  })

  test('restores the outer context when a nested callback throws', () => {
    const previous = getLogger()
    const outer = {
      logger: pino({enabled: false}),
    }
    const inner = {
      logger: pino({enabled: false}),
    }
    const failure = new Error('Logging scope failed')

    withLogger(outer, () => {
      expect(() => {
        withLogger(inner, () => {
          expect(getLogger()).toBe(inner)
          throw failure
        })
      }).toThrow(failure)
      expect(getLogger()).toBe(outer)
    })

    expect(getLogger()).toBe(previous)
  })

  test('isolates overlapping asynchronous contexts', async () => {
    const previous = getLogger()
    const first = {
      logger: pino({enabled: false}),
    }
    const second = {
      logger: pino({enabled: false}),
    }
    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()

    const firstResult = withLogger(first, async () => {
      ready.resolve()
      await release.promise
      expect(getLogger()).toBe(first)
      return 'first'
    })
    const secondResult = withLogger(second, async () => {
      await ready.promise
      expect(getLogger()).toBe(second)
      release.resolve()
      await firstResult
      expect(getLogger()).toBe(second)
      return 'second'
    })

    expect(getLogger()).toBe(previous)
    expect(await Promise.all([firstResult, secondResult])).toEqual(['first', 'second'])
    expect(getLogger()).toBe(previous)
  })
})

describe('span', () => {
  test('adds bindings to the active logger and restores it when the block exits', () => {
    const context = {
      logger: pino({enabled: false}).child({
        experiment: 'example',
      }),
    }

    withLogger(context, () => {
      {
        using _scope = span({
          trial: 'first',
        })

        expect(getLogger().logger.bindings()).toEqual({
          experiment: 'example',
          trial: 'first',
        })
      }

      expect(getLogger()).toBe(context)
    })
  })

  test('restores the previous context when the block throws', () => {
    const previous = getLogger()
    const failure = new Error('Span failed')

    expect(() => {
      using _scope = span({
        trial: 'first',
      })

      expect(getLogger().logger.bindings()).toEqual({
        trial: 'first',
      })

      throw failure
    }).toThrow(failure)

    expect(getLogger()).toBe(previous)
  })

  test('inherits nested bindings and restores each parent context', () => {
    const previous = getLogger()

    {
      using _outerScope = span({
        experiment: 'example',
      })
      const outer = getLogger()

      {
        using _innerScope = span({
          trial: 'first',
        })

        expect(getLogger().logger.bindings()).toEqual({
          experiment: 'example',
          trial: 'first',
        })
      }

      expect(getLogger()).toBe(outer)
      expect(getLogger().logger.bindings()).toEqual({
        experiment: 'example',
      })
    }

    expect(getLogger()).toBe(previous)
  })
})

describe('logging functions', () => {
  test('error forwards structured errors to the scoped logger', () => {
    const logger = pino({enabled: false})
    const write = vi.spyOn(logger, 'error')
    const fields = {
      err: new Error('Trial failed'),
    }

    withLogger({logger}, () => {
      error(fields, 'Failed to run trial')
    })

    expect(write).toHaveBeenCalledWith(fields, 'Failed to run trial')
  })

  test('debug forwards message-only formatting arguments', () => {
    const logger = pino({enabled: false})
    const write = vi.spyOn(logger, 'debug')
    const trials = ['first', 'second']

    withLogger({logger}, () => {
      debug('Running %s trials: %o', trials.length, trials)
    })

    expect(write).toHaveBeenCalledWith('Running %s trials: %o', trials.length, trials)
  })

  test.each([
    ['trace', trace],
    ['debug', debug],
    ['info', info],
    ['warn', warn],
    ['error', error],
    ['fatal', fatal],
  ] as const)('%s forwards arguments to the scoped logger', (level, log) => {
    expectTypeOf(log).toEqualTypeOf<LogFn>()

    const logger = pino({enabled: false})
    const write = vi.spyOn(logger, level)
    const fields = {
      trial: 'example',
    }

    withLogger({logger}, () => {
      log(fields, 'Running %s', 'trial')
    })

    expect(write).toHaveBeenCalledWith(fields, 'Running %s', 'trial')
  })
})
