import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

type BuildOptions = {
  directory: string
  benchmarksDirectory: string
  experimentsDirectory: string
  scenariosDirectory: string
}

type ServeOptions = {
  directory: string
  benchmarksDirectory: string
  experimentsDirectory: string
  scenariosDirectory: string
}

async function build({directory}: BuildOptions): Promise<void> {
  await runNextCommand('build', directory, {
    AGENT_EVAL_UI_OUTPUT: 'export',
  })
}

async function serve({
  directory,
  benchmarksDirectory,
  experimentsDirectory,
  scenariosDirectory,
}: ServeOptions): Promise<void> {
  await runNextCommand('dev', directory, {
    AGENT_EVAL_UI_BENCHMARKS_DIRECTORY: path.resolve(benchmarksDirectory),
    AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY: path.resolve(experimentsDirectory),
    AGENT_EVAL_UI_SCENARIOS_DIRECTORY: path.resolve(scenariosDirectory),
  })
}

async function runNextCommand(
  command: 'build' | 'dev',
  directory: string,
  env?: Record<string, string>,
): Promise<void> {
  const nextBin = require.resolve('next/dist/bin/next')
  const args = [nextBin, command]
  const child = spawn(process.execPath, args, {
    cwd: directory,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
    },
  })

  let stopping = false

  const interrupt = () => {
    stopping = true
    child.kill('SIGINT')
  }

  const terminate = () => {
    stopping = true
    child.kill('SIGTERM')
  }

  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)

  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0 || (stopping && command === 'dev')) {
          resolve()
        } else {
          reject(new Error(`agent-eval ui process failed (${signal ?? code})`))
        }
      })
    })
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}

export {build, serve}
export type {BuildOptions, ServeOptions}
