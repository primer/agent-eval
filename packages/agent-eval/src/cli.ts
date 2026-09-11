import {defineCommand, runMain} from 'citty'
import {benchmark} from './cli/commands/benchmark'
import {logger, levels} from './logger'
import packageJson from '../package.json' with {type: 'json'}

// const experiment = defineCommand({
//   meta: {
//     name: 'experiment',
//     description: 'Run an experiment',
//   },
//   args: {
//     name: {
//       type: 'positional',
//       description: 'The name of the experiment to run',
//     },
//   },
//   async run() {
//     //
//   },
// })
//
// const mergeResults = defineCommand({
//   meta: {
//     name: 'merge-results',
//     description: 'Merge the results of a sharded plan',
//   },
//   args: {},
//   async run() {
//     //
//   },
// })

const cli = defineCommand({
  meta: {
    name: 'agent-eval',
    version: packageJson.version,
    description: 'Run benchmarks and experiments for agent evaluation',
  },
  args: {
    'log-level': {
      type: 'enum',
      options: [...levels],
      default: 'info',
      description: 'The log level to use',
    },
  },
  subCommands: {
    benchmark,
    // experiment,
    // 'merge-results': mergeResults,
  },
  setup({args}) {
    logger.level = args['log-level']
  },
})

runMain(cli)
