// import {access} from 'node:fs/promises'
// import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import path from 'node:path'
import {defineCommand} from 'citty'
import {benchmarksOption, scenariosOption} from '../options'
// import * as z from 'zod/mini'
// import {logger} from '../../logger'

// const optionsSchema = z.object({
//   port: z._default(
//     z.pipe(
//       z.string().check(z.regex(/^\d+$/, 'Port must be an integer from 1 to 65535')),
//       z.coerce.number<string>().check(z.int(), z.minimum(1), z.maximum(65535)),
//     ),
//     3000,
//   ),
//   hostname: z._default(z.string().check(z.trim(), z.minLength(1)), '127.0.0.1'),
// })
//
// export function parseUiOptions(input: unknown) {
//   return z.parse(optionsSchema, input)
// }

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const NEXT_APP_DIRECTORY = path.resolve(import.meta.dirname, '..', '..', '..', 'src', 'ui')

const uiCommand = defineCommand({
  meta: {
    name: 'ui',
    description: 'Run the agent-eval UI',
  },
  args: {
    benchmarks: benchmarksOption,
    experiments: experimentsOption,
    scenarios: scenariosOption,
    // port: {
    //   type: 'string',
    //   description: 'Port to listen on',
    //   default: '3000',
    // },
    // hostname: {
    //   type: 'string',
    //   description: 'Hostname to listen on',
    //   default: '127.0.0.1',
    // },
  },
  subCommands: {
    // build: defineCommand({
    //   meta: {
    //     name: 'build',
    //     description: 'Build a static UI for GitHub Pages or another static host',
    //   },
    //   args: {
    //     'base-path': {
    //       type: 'string',
    //       description: 'Deployment URL prefix, such as /my-repository (empty for a domain root)',
    //       default: '',
    //     },
    //     'output-dir': {
    //       type: 'string',
    //       description: 'Directory for the static UI export',
    //       default: './out',
    //     },
    //   },
    //   async run({args}) {
    //     // const options = parseUiBuildOptions({
    //     //   basePath: args['base-path'],
    //     //   outputDirectory: args['output-dir'],
    //     // })
    //     // await buildUi(options)
    //     // logger.info('Static UI written to %s', options.outputDirectory)
    //     // await runNextCommand(['build'])
    //   },
    // }),
  },
  async run({args}) {
    // Citty also invokes the parent run handler after a subcommand.
    if (args._.length > 0) {
      return
    }

    const benchmarksDirectory = path.resolve(args.benchmarks)
    const experimentsDirectory = path.resolve(args.experiments)
    const scenariosDirectory = path.resolve(args.scenarios)

    await runNextCommand([], {
      AGENT_EVAL_UI_BENCHMARKS_DIRECTORY: benchmarksDirectory,
      AGENT_EVAL_UI_EXPERIMENTS_DIRECTORY: experimentsDirectory,
      AGENT_EVAL_UI_SCENARIOS_DIRECTORY: scenariosDirectory,
    })
  },
})

async function runNextCommand(args: Array<string> = [], env?: Record<string, string>): Promise<void> {
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: NEXT_APP_DIRECTORY,
    stdio: 'inherit',
    env: {
      NODE_ENV: 'development',
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
    return await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (stopping) {
          resolve()
        } else if (code === 0) {
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

export {uiCommand as ui}
