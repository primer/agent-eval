import {defineCommand} from 'citty'
import {runUi} from '../../ui/load'

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
        await runUi({mode: 'dev', results: args.results, port: args.port})
      },
    }),
    build: defineCommand({
      meta: {name: 'build', description: 'Build a static results site'},
      args: {
        results: resultsOption,
        'output-dir': {type: 'string', default: './out', description: 'Directory for the static site'},
        'base-path': {type: 'string', default: '', description: 'Hosting subpath, for example /my-repository'},
      },
      async run({args}) {
        await runUi({
          mode: 'build',
          results: args.results,
          outputDirectory: args['output-dir'],
          basePath: args['base-path'],
        })
      },
    }),
  },
})

export {ui}
