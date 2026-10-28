import {AsyncLocalStorage} from 'node:async_hooks'
import process from 'node:process'
import pino, {type LogFn} from 'pino'
import pretty from 'pino-pretty'

const CI = process.env.CI === 'true' || process.env.CI === '1' || process.env.GITHUB_ACTIONS === 'true'

const stream = []

if (!CI) {
  stream.push(
    pretty({
      colorize: true,
    }),
  )
}

export const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Preserve a public name for portable declarations.
export interface Logger extends pino.Logger {}

export const logger: Logger = pino(
  {
    base: undefined,
    level: 'info',
    timestamp: false,
    enabled: process.env.NODE_ENV !== 'test',
  },
  ...stream,
)

type LoggerContext = {
  logger: Logger
}

const DefaultLoggerContext: LoggerContext = {
  logger,
}

const contexts = new AsyncLocalStorage<LoggerContext>({
  defaultValue: DefaultLoggerContext,
})

function getLogger(): LoggerContext {
  return contexts.getStore()!
}

function withLogger<T>(context: LoggerContext, callback: () => T): T {
  return contexts.run(context, callback)
}

type Args = Parameters<LogFn>

function trace(...args: Args): void {
  const {logger} = getLogger()
  logger.trace(...args)
}

function debug(...args: Args): void {
  const {logger} = getLogger()
  logger.debug(...args)
}

function info(...args: Args): void {
  const {logger} = getLogger()
  logger.info(...args)
}

function warn(...args: Args): void {
  const {logger} = getLogger()
  logger.warn(...args)
}

function error(...args: Args): void {
  const {logger} = getLogger()
  logger.error(...args)
}

function fatal(...args: Args): void {
  const {logger} = getLogger()
  logger.fatal(...args)
}

export {getLogger, withLogger, trace, debug, info, warn, error, fatal}
