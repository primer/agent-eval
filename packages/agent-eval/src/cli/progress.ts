import {MultiBar, type SingleBar} from 'cli-progress'
import {logger} from '../logger'
import type {PlanProgress} from '../plan'

function createProgressReporter(enabled: boolean, stream: NodeJS.WritableStream = process.stderr) {
  const previousLevel = logger.level
  let disposed = false
  let stopped = false
  let bar: SingleBar | undefined
  const progress = enabled
    ? new MultiBar({
        stream,
        format: '[{bar}] Trials: {value}/{total} ({percentage}%) | In flight: {inFlight}',
        barsize: 20,
        noTTYOutput: true,
        emptyOnZero: false,
        linewrap: true,
      })
    : undefined

  const stop = () => {
    if (bar && !stopped) {
      stopped = true
      progress?.stop()
    }
  }

  if (enabled && logger.levelVal < logger.levels.values.warn) {
    logger.level = 'warn'
  }

  return {
    update({total, completed, inFlight}: PlanProgress) {
      if (!progress || disposed || stopped) {
        return
      }

      if (!bar) {
        bar = progress.create(total, completed, {inFlight})
      } else {
        bar.update(completed, {inFlight})
      }
      if (completed === total) {
        stop()
      }
    },
    [Symbol.dispose]() {
      if (disposed) {
        return
      }
      disposed = true
      stop()
      if (enabled) {
        logger.level = previousLevel
      }
    },
  }
}

export {createProgressReporter}
