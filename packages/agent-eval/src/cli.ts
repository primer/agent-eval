import {defineCommand, runMain, type SubCommandsDef} from 'citty'
import {benchmark} from './cli/commands/benchmark'
import {experiment} from './cli/commands/experiment'
import {scenario} from './cli/commands/scenario'
import {enabled} from './feature-flag'
import {logger, levels} from './logger'
import packageJson from '../package.json' with {type: 'json'}

const subCommands: SubCommandsDef = {
  benchmark,
  experiment,
  scenario,
}

if (enabled('ui-command')) {
  subCommands.ui = async () => {
    const mod = await import('./cli/commands/ui')
    return mod.ui
  }
}

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
  subCommands,
  setup({args}) {
    logger.level = args['log-level']
  },
})

runMain(cli)
