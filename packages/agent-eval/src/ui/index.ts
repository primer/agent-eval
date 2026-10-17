import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

type BuildOptions = {
  directory: string
  basePath?: string
  outputDirectory?: string
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

async function build({
  directory,
  basePath,
  outputDirectory,
  benchmarksDirectory,
  experimentsDirectory,
  scenariosDirectory,
}: BuildOptions): Promise<void> {
  const env: Record<string, string> = {
    AGENT_EVAL_UI_BENCHMARKS_DIRECTORY: benchmarksDirectory,
    AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY: experimentsDirectory,
    AGENT_EVAL_UI_OUTPUT: 'export',
    AGENT_EVAL_UI_SCENARIOS_DIRECTORY: scenariosDirectory,
    NODE_ENV: 'production',
  }

  if (basePath) {
    env['AGENT_EVAL_UI_BASE_PATH'] = basePath
  }

  if (outputDirectory) {
    env['AGENT_EVAL_UI_OUTPUT_DIRECTORY'] = path.relative(directory, outputDirectory)
  }

  await runNextCommand('build', directory, env)
}

async function serve({
  directory,
  benchmarksDirectory,
  experimentsDirectory,
  scenariosDirectory,
}: ServeOptions): Promise<void> {
  await runNextCommand('dev', directory, {
    AGENT_EVAL_UI_BENCHMARKS_DIRECTORY: benchmarksDirectory,
    AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY: experimentsDirectory,
    AGENT_EVAL_UI_SCENARIOS_DIRECTORY: scenariosDirectory,
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
