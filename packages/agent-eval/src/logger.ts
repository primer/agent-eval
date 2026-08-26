import {format} from 'node:util'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

type LogWriter = (message: string) => void

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export function parseLogLevel(value: string): LogLevel {
  if (LOG_LEVELS.includes(value as LogLevel)) {
    return value as LogLevel
  }

  throw new Error(`Invalid log level "${value}". Expected one of: ${LOG_LEVELS.join(', ')}`)
}

export function getDefaultLogLevel(env: Readonly<Record<string, string | undefined>> = process.env): LogLevel {
  if (env.RUNNER_DEBUG === '1' || env.ACTIONS_STEP_DEBUG?.toLowerCase() === 'true') {
    return 'debug'
  }

  return 'info'
}

export class Logger {
  #level: LogLevel
  readonly #stdout: LogWriter
  readonly #stderr: LogWriter

  constructor({
    level,
    stdout = message => process.stdout.write(message),
    stderr = message => process.stderr.write(message),
  }: {
    level: LogLevel
    stdout?: LogWriter
    stderr?: LogWriter
  }) {
    this.#level = level
    this.#stdout = stdout
    this.#stderr = stderr
  }

  setLevel(level: LogLevel) {
    this.#level = level
  }

  debug(message: unknown, ...args: Array<unknown>) {
    this.#write('debug', message, args)
  }

  info(message: unknown, ...args: Array<unknown>) {
    this.#write('info', message, args)
  }

  warn(message: unknown, ...args: Array<unknown>) {
    this.#write('warn', message, args)
  }

  error(message: unknown, ...args: Array<unknown>) {
    this.#write('error', message, args)
  }

  #write(level: LogLevel, message: unknown, args: Array<unknown>) {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.#level]) {
      return
    }

    const output = `[${level.toUpperCase()}] ${format(message, ...args)}\n`
    const writer = level === 'warn' || level === 'error' ? this.#stderr : this.#stdout
    writer(output)
  }
}

export const logger = new Logger({level: getDefaultLogLevel()})
