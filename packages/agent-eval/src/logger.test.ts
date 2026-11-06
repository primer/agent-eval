import pino from 'pino'
import {describe, expect, test, vi} from 'vitest'
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Disposal manages the logging context.
        using scope = span({
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Disposal manages the logging context.
      using scope = span({
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Disposal manages the logging context.
      using outerScope = span({
        experiment: 'example',
      })
      const outer = getLogger()

      {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Disposal manages the logging context.
        using innerScope = span({
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
  test.each([
    ['trace', trace],
    ['debug', debug],
    ['info', info],
    ['warn', warn],
    ['error', error],
    ['fatal', fatal],
  ] as const)('%s forwards arguments to the scoped logger', (level, log) => {
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
