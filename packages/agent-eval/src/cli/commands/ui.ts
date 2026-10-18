import path from 'node:path'
import {defineCommand} from 'citty'
import {build, serve} from '../../ui'
import {benchmarksOption, experimentsOption, scenariosOption} from '../options'

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
      directory: path.resolve(import.meta.dirname, '../../ui'),
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
          directory: path.resolve(import.meta.dirname, '../../ui'),
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
