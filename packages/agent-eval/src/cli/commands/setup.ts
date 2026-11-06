import {defineCommand} from 'citty'
import {DefaultHost} from '../../host'
import {info} from '../../logger'
import {setupInstructions} from '../setup'

const setup = defineCommand({
  meta: {
    name: 'setup',
    description: 'Add agent-eval guidance to your project’s agent instructions',
  },
  async run() {
    const {filepath, updated} = await setupInstructions(DefaultHost, process.cwd())
    info(updated ? 'Updated agent-eval instructions in %s' : 'Agent-eval instructions already present in %s', filepath)
  },
})

export {setup}
