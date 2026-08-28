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

export const logger = pino(
  {
    base: undefined,
    level: 'info',
    timestamp: false,
    // enabled: process.env.NODE_ENV !== 'test',
  },
  ...stream,
)
