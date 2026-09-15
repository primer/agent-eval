import path from 'node:path'
import {defineCommand} from 'citty'
import {logger} from '../../logger'
import {getScenario} from '../../scenario/get'
import {
  concurrencyOption,
  dockerImageOption,
  getConcurrencyValue,
  getCopilotToken,
  githubCopilotTokenOption,
  outputDirectoryOption,
  scenariosOption,
} from '../options'
import {createScenarioPlan} from '../../scenario/plan'
import {runPlan} from '../../plan'

export const scenario = defineCommand({
  meta: {
    name: 'scenario',
  },
  subCommands: {
    run: defineCommand({
      meta: {
        name: 'run',
        description: 'Run a specific scenario',
      },
      args: {
        check: {
          type: 'string',
          description: 'The name of the check to run',
        },
        concurrency: concurrencyOption,
        'docker-image': dockerImageOption,
        name: {
          type: 'positional',
          description: 'The name of the scenario',
          required: true,
        },
        'output-dir': outputDirectoryOption,
        scenarios: scenariosOption,
        token: githubCopilotTokenOption,
      },
      async run({args}) {
        logger.info('Running scenario: %s', args.name)

        const concurrency = getConcurrencyValue(args.concurrency)
        const scenariosDirectory = path.resolve(args.scenarios)
        const resultsDirectory = path.resolve(args['output-dir'])
        const artifactsDirectory = path.join(resultsDirectory, 'artifacts')
        const copilotToken = getCopilotToken(args.token)

        logger.debug({
          artifactsDirectory,
          concurrency,
          resultsDirectory,
          scenariosDirectory,
        })

        const scenario = await getScenario({
          directory: scenariosDirectory,
          name: args.name,
        })

        if (args.check) {
          const check = scenario.checks.find(check => {
            return check.name === args.check
          })

          if (!check) {
            throw new Error(
              `Check "${args.check}" not found in scenario "${args.name}". Available checks: ${scenario.checks.map(check => check.name).join(', ')}`,
            )
          }

          scenario.checks = [check]
        }

        const plan = createScenarioPlan({
          scenario,
        })

        await runPlan({
          artifactsDirectory,
          concurrency,
          copilotToken,
          dockerImage: args['docker-image'],
          plan,
        })
      },
    }),
  },
})
