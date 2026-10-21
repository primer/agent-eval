import {defineCommand} from 'citty'
import {setup} from './setup'

const agent = defineCommand({
  meta: {
    name: 'agent',
    description: 'Manage agent instructions',
  },
  subCommands: {
    setup,
  },
})

export {agent}
