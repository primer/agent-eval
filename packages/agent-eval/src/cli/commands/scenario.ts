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
  getRunPlanExecutionOptions,
  githubCopilotTokenOption,
  maxRetriesOption,
  noInstallDependenciesOption,
  noWalkthroughOption,
  outputDirectoryOption,
  preparedImageOption,
  scenariosOption,
  runnerOption,
  timeoutMsOption,
} from '../options'
import {getScenario} from '../../scenario/get'
import {createScenarioPlan} from '../../scenario/plan'
import {runPlan} from '../../plan'
import type {RunTrialResult} from '../../trial/run'

const scenarioCommand = defineCommand({
  meta: {
    name: 'scenario',
    description: 'Run scenarios',
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
        'copilot-concurrency': copilotConcurrencyOption,
        'container-concurrency': containerConcurrencyOption,
        'docker-image': dockerImageOption,
        'max-retries': maxRetriesOption,
        'no-install-dependencies': noInstallDependenciesOption,
        'no-walkthrough': noWalkthroughOption,
        name: {
          type: 'positional',
          description: 'The name of the scenario',
          required: true,
        },
        'output-dir': outputDirectoryOption,
        'prepared-image': preparedImageOption,
        scenarios: scenariosOption,
        runner: runnerOption,
        'timeout-ms': timeoutMsOption,
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
          plan,
          ...getRunPlanExecutionOptions(args),
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
