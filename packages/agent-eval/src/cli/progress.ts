import {logger} from '../logger'
import type {PlanProgress} from '../plan'

type ProgressStream = {
  isTTY?: boolean
  write(text: string): unknown
}

function createProgressReporter(enabled: boolean, stream: ProgressStream = process.stderr) {
  const previousLevel = logger.level
  let disposed = false
  let lineActive = false

  if (enabled && logger.levelVal < logger.levels.values.warn) {
    logger.level = 'warn'
  }

  return {
    update({total, completed, inFlight}: PlanProgress) {
      if (!enabled || disposed) {
        return
      }

      const percentage = total === 0 ? 100 : Math.floor((completed / total) * 100)
      const line = `Trials: ${completed}/${total} (${percentage}%) | In flight: ${inFlight}`
      lineActive = Boolean(stream.isTTY) && completed < total
      stream.write(`${stream.isTTY ? '\r\x1b[2K' : ''}${line}${lineActive ? '' : '\n'}`)
    },
    [Symbol.dispose]() {
      if (disposed) {
        return
      }
      disposed = true
      if (lineActive) {
        stream.write('\n')
      }
      if (enabled) {
        logger.level = previousLevel
      }
    },
  }
}

export {createProgressReporter}
