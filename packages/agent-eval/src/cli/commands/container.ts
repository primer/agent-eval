import {defineCommand} from 'citty'
import {recoverContainers} from '../../docker'
import {logger} from '../../logger'

const container = defineCommand({
  meta: {name: 'container', description: 'Recover containers left behind by evaluation runs'},
  subCommands: {
    clean: defineCommand({
      meta: {name: 'clean', description: 'Remove containers from an inactive run owned by this host and user'},
      args: {
        'run-id': {
          type: 'string',
          description: 'The UUID from the run log or run-<id>.json in the output directory',
          required: true,
        },
      },
      async run({args}) {
        const result = await recoverContainers(args['run-id'])
        logger.info({removed: result.removed, skipped: result.skipped}, 'Container recovery finished')
        if (result.skipped.length > 0) {
          throw new Error('Some containers were skipped because inactive ownership could not be confirmed')
        }
      },
    }),
  },
})

export {container}
