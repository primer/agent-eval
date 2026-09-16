import path from 'node:path'
import {defineCommand} from 'citty'
import {DefaultHost as host} from '../../host'
import {logger} from '../../logger'
import {
  copilotConcurrencyOption,
  containerConcurrencyOption,
  dockerImageOption,
  getConcurrencyValue,
  getCopilotToken,
  getOutputPath,
  githubCopilotTokenOption,
  outputDirectoryOption,
  scenariosOption,
  runnerOption,
} from '../options'
import {getScenario} from '../../scenario/get'
import {createScenarioPlan} from '../../scenario/plan'
import {runPlan} from '../../plan'
import type {RunTrialResult} from '../../trial/run'
import {buildScenarioImage} from '../../scenario/image'
import {listScenarios} from '../../scenario/list'

const scenarioCommand = defineCommand({
  meta: {
    name: 'scenario',
    description: 'Run scenarios',
  },
  subCommands: {
    build: defineCommand({
      meta: {
        name: 'build',
        description: 'Build a scenario image without running an agent, or build all scenarios',
      },
      args: {
        name: {
          type: 'positional',
          description: 'The name of the scenario (omit to build all scenarios)',
          required: false,
        },
        scenarios: scenariosOption,
        'docker-image': dockerImageOption,
      },
      async run({args}) {
        const directory = path.resolve(args.scenarios)
        const scenarios = args.name
          ? [await getScenario({directory, name: args.name})]
          : await listScenarios({directory})
        if (scenarios.length === 0) {
          throw new Error(`No scenarios found in: ${directory}`)
        }
        for (const scenario of scenarios) {
          const image = await buildScenarioImage({scenario, dockerImage: args['docker-image']})
          console.log(JSON.stringify({scenario: scenario.id, image}))
        }
      },
    }),
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
        'copilot-concurrency': copilotConcurrencyOption,
        'container-concurrency': containerConcurrencyOption,
        'docker-image': dockerImageOption,
        name: {
          type: 'positional',
          description: 'The name of the scenario',
          required: true,
        },
        'output-dir': outputDirectoryOption,
        scenarios: scenariosOption,
        runner: runnerOption,
        token: githubCopilotTokenOption,
      },
      async run({args}) {
        logger.info('Running scenario: %s', args.name)

        const copilotConcurrency = getConcurrencyValue(args['copilot-concurrency'], 'copilot-concurrency')
        const containerConcurrency = getConcurrencyValue(args['container-concurrency'], 'container-concurrency')
        const scenariosDirectory = path.resolve(args.scenarios)
        const resultsDirectory = path.resolve(args['output-dir'])
        const artifactsDirectory = path.join(resultsDirectory, 'artifacts')
        const outputPath = getOutputPath(resultsDirectory)
        const copilotToken = getCopilotToken(args.token)

        logger.debug({
          artifactsDirectory,
          copilotConcurrency,
          containerConcurrency,
          resultsDirectory,
          scenariosDirectory,
        })

        const scenario = await getScenario({
          directory: scenariosDirectory,
          name: args.name,
        })

        if (args.check) {
          const check = scenario.checks.find(scenarioCheck => {
            return scenarioCheck.name === args.check
          })

          if (!check) {
            throw new Error(
              `Check "${args.check}" not found in scenario "${args.name}". Available checks: ${scenario.checks.map(scenarioCheck => scenarioCheck.name).join(', ')}`,
            )
          }

          scenario.checks = [check]
        }

        const plan = createScenarioPlan({
          scenario,
          runner: args.runner,
        })

        const {results} = await runPlan({
          artifactsDirectory,
          copilotConcurrency,
          containerConcurrency,
          copilotToken,
          dockerImage: args['docker-image'],
          plan,
        })

        type ScenarioOutput = {
          id: string
          results: Array<{
            trial: {
              id: string
            }
            result: RunTrialResult
          }>
        }

        const output: ScenarioOutput = {
          id: scenario.id,
          results: results.map(result => {
            return {
              trial: {
                id: result.trial.id,
              },
              result: result.result,
            }
          }),
        }

        await host.fs.mkdir(path.dirname(outputPath), {
          recursive: true,
        })
        await host.fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8')
      },
    }),
  },
})

export {scenarioCommand as scenario}
