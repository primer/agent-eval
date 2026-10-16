import path from 'node:path'
import {defineCommand} from 'citty'
import {build, serve} from '@primer/agent-eval-ui'
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
    if (args._.length === 0) {
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
        benchmarks: benchmarksOption,
        experiments: experimentsOption,
        scenarios: scenariosOption,
      },
      async run({args}) {
        const benchmarksDirectory = path.resolve(args.benchmarks)
        const experimentsDirectory = path.resolve(args.experiments)
        const scenariosDirectory = path.resolve(args.scenarios)

        await build({
          directory: path.join(import.meta.dirname, 'ui'),
          benchmarksDirectory,
          experimentsDirectory,
          scenariosDirectory,
        })
      },
    }),
  },
})

export {uiCommand as ui}
