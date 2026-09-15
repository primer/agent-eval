import {defineCommand, runMain} from 'citty'
import {benchmark} from './cli/commands/benchmark'
import {experiment} from './cli/commands/experiment'
import {logger, levels} from './logger'
import packageJson from '../package.json' with {type: 'json'}

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
    experiment,
  },
  setup({args}) {
    logger.level = args['log-level']
  },
})

runMain(cli)
