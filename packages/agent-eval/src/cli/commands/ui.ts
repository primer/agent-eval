import {defineCommand} from 'citty'
import {buildUi, startUi} from '../../ui/server'
import {logger} from '../../logger'

const resultsOption = {
  type: 'string',
  description: 'A result bundle or directory containing result bundles',
  default: './results',
} as const

const ui = defineCommand({
  meta: {name: 'ui', description: 'View evaluation results'},
  subCommands: {
    dev: defineCommand({
      meta: {name: 'dev', description: 'View local results with automatic refresh'},
      args: {
        results: resultsOption,
        port: {type: 'string', default: '3000', description: 'Local server port'},
      },
      async run({args}) {
        const server = await startUi(args.results, args.port)
        const address = server.address()
        if (address && typeof address !== 'string') {
          logger.info('Results UI: http://127.0.0.1:%s', address.port)
        }
      },
    }),
    build: defineCommand({
      meta: {name: 'build', description: 'Build a static results site'},
      args: {
        results: resultsOption,
        'output-dir': {type: 'string', default: './out', description: 'Directory for the static site'},
      },
      async run({args}) {
        const directory = await buildUi(args.results, args['output-dir'])
        logger.info('Results site written to %s', directory)
      },
    }),
  },
})

export {ui}
