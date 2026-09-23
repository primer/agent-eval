import {SingleBar} from 'cli-progress'
import {logger} from '../logger'
import type {PlanProgress} from '../plan'

function createProgressReporter(enabled: boolean, stream: NodeJS.WritableStream = process.stderr) {
  const previousLevel = logger.level
  let disposed = false
  let started = false
  const bar = enabled
    ? new SingleBar({
        stream,
        format: '[{bar}] Trials: {value}/{total} ({percentage}%) | In flight: {inFlight}',
        barsize: 20,
        noTTYOutput: true,
        emptyOnZero: false,
      })
    : undefined

  if (enabled && logger.levelVal < logger.levels.values.warn) {
    logger.level = 'warn'
  }

  return {
    update({total, completed, inFlight}: PlanProgress) {
      if (!bar || disposed) {
        return
      }

      if (!started) {
        started = true
        bar.start(total, completed, {inFlight})
      } else {
        bar.update(completed, {inFlight})
      }
      if (completed === total) {
        bar.stop()
      }
    },
    [Symbol.dispose]() {
      if (disposed) {
        return
      }
      disposed = true
      bar?.stop()
      if (enabled) {
        logger.level = previousLevel
      }
    },
  }
}

export {createProgressReporter}
