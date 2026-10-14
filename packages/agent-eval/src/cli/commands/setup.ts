import {defineCommand} from 'citty'
import {DefaultHost} from '../../host'
import {logger} from '../../logger'
import {setupInstructions} from '../setup'

const setup = defineCommand({
  meta: {
    name: 'setup',
    description: 'Add agent-eval guidance to your project’s agent instructions',
  },
  async run() {
    const {filepath, updated} = await setupInstructions(DefaultHost, process.cwd())
    logger.info(
      updated ? 'Added agent-eval instructions to %s' : 'Agent-eval instructions already present in %s',
      filepath,
    )
  },
})

export {setup}
