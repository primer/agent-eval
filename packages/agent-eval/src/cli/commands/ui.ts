import path from 'node:path'
import {defineCommand} from 'citty'
import {build, serve} from '@primer/agent-eval-ui'
import {benchmarksOption, experimentsOption, scenariosOption} from '../options'

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

//   args: {

const uiCommand = defineCommand({
  meta: {
    name: 'ui',
    description: 'Run the agent-eval UI',
  },
  args: {
    benchmarks: benchmarksOption,
    experiments: experimentsOption,
    scenarios: scenariosOption,
  },
  async run({args}) {
    // Return early if a sub-command is called
    if (args._.length > 0) {
      return
    }

    const benchmarksDirectory = path.resolve(args.benchmarks)
    const experimentsDirectory = path.resolve(args.experiments)
    const scenariosDirectory = path.resolve(args.scenarios)

    await serve({
      directory: path.join(import.meta.dirname, 'ui'),
      benchmarksDirectory,
      experimentsDirectory,
      scenariosDirectory,
    })
  },
  subCommands: {
    build: defineCommand({
      meta: {
        name: 'build',
        description: 'Build a static copy of the agent-eval ui',
      },
      args: {
        'base-path': {
          type: 'string',
          description: 'Deployment URL prefix, such as /my-repository (empty for a domain root)',
          default: '',
        },
        benchmarks: benchmarksOption,
        experiments: experimentsOption,
        'output-dir': {
          type: 'string',
          description: 'Directory for the static UI export',
          default: './out',
        },
        scenarios: scenariosOption,
      },
      async run({args}) {
        const benchmarksDirectory = path.resolve(args.benchmarks)
        const experimentsDirectory = path.resolve(args.experiments)
        const scenariosDirectory = path.resolve(args.scenarios)

        await build({
          basePath: args['base-path'],
          directory: path.join(import.meta.dirname, 'ui'),
          benchmarksDirectory,
          experimentsDirectory,
          outputDirectory: path.resolve(args['output-dir']),
          scenariosDirectory,
        })
      },
    }),
  },
})

export {uiCommand as ui}
