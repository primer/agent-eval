import process from 'node:process'
import pino from 'pino'
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
