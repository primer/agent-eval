import {appendFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {isMainThread} from 'node:worker_threads'

// Consumed before the CLI loads so subprocesses don't inherit instrumentation.
const directory = process.env.AGENT_EVAL_PROFILE_DIRECTORY
const intervalMs = Number(process.env.AGENT_EVAL_PROFILE_INTERVAL)
delete process.env.AGENT_EVAL_PROFILE_DIRECTORY
delete process.env.AGENT_EVAL_PROFILE_INTERVAL

if (isMainThread && directory) recordProcess(directory, intervalMs)

function recordProcess(directory: string, intervalMs: number) {
  const started = performance.now()
  let sampleCount = 0
  let maxSampledRssBytes = 0
  let measurementError: string | null = null

  function sample() {
    const memory = process.memoryUsage()
    maxSampledRssBytes = Math.max(maxSampledRssBytes, memory.rss)
    appendFileSync(
      join(directory, 'memory.jsonl'),
      `${JSON.stringify({elapsedMs: performance.now() - started, ...memory})}\n`,
    )
    sampleCount++
  }

  function flush() {
    try {
      sample()
      const cpu = process.cpuUsage()
      writeFileSync(
        join(directory, 'process.json'),
        JSON.stringify({
          pid: process.pid,
          elapsedMs: performance.now() - started,
          cpuUserMs: cpu.user / 1000,
          cpuSystemMs: cpu.system / 1000,
          maxSampledRssBytes,
          sampleCount,
          resourceUsage: process.resourceUsage(),
          measurementError,
        }),
      )
    } catch (error) {
      measurementError = String(error)
      console.error(`Profiling metrics could not be written: ${measurementError}`)
    }
  }

  flush()
  const timer = setInterval(flush, intervalMs)
  timer.unref()
  process.on('exit', () => {
    clearInterval(timer)
    flush()
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => {
      flush()
      process.removeListener(signal, handler)
      // Preserve default signal termination unless the CLI owns graceful shutdown.
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
    }
    process.on(signal, handler)
  }
}
