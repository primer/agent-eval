import path from 'node:path'
import Docker from 'dockerode'
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
import {buildScenarioImage} from '../../scenario/scenario'
import {runPlan} from '../../plan'
import type {RunTrialResult} from '../../trial/run'

const scenarioCommand = defineCommand({
  meta: {
    name: 'scenario',
    description: 'Run scenarios',
  },
  subCommands: {
    image: defineCommand({
      meta: {
        name: 'image',
      },
      subCommands: {
        build: defineCommand({
          meta: {
            name: 'build',
            description: 'Build the Docker image for a scenario',
          },
          args: {
            name: {
              type: 'positional',
              description: 'The name of the scenario',
              required: true,
            },
            scenarios: scenariosOption,
          },
          async run({args}) {
            logger.info('Building Docker image for scenario: %s', args.name)

            const scenariosDirectory = path.resolve(args.scenarios)
            const scenario = await getScenario({
              directory: scenariosDirectory,
              name: args.name,
            })

            await buildScenarioImage({
              scenario,
            })
          },
        }),
        clean: defineCommand({
          meta: {
            name: 'clean',
            description: 'Remove the Docker image for a scenario, or all scenarios',
          },
          args: {
            name: {
              type: 'positional',
              description: 'The name of the scenario',
              required: false,
            },
            scenarios: scenariosOption,
          },
          async run({args}) {
            const scenariosDirectory = path.resolve(args.scenarios)
            const docker = new Docker()

            if (args.name) {
              logger.info('Removing Docker images for scenario: %s', args.name)
              const images = await docker.listImages().then(images => {
                return images.filter(image => {
                  return image.RepoTags?.some(tag => {
                    return tag.startsWith(`agent-eval/scenario/${args.name}:`)
                  })
                })
              })

              for (const image of images) {
                if (image.RepoTags === undefined) {
                  throw new Error(`Image ${image.Id} has no tags`)
                }

                const [tag] = image.RepoTags

                logger.info('Removing image with tag: %s', tag)
                const dockerImage = docker.getImage(tag)
                await dockerImage.remove()
              }
            } else {
              logger.info('Removing all Docker images for scenarios in directory: %s', scenariosDirectory)
              const tagGroups = ['agent-eval/tools', 'agent-eval/sandbox', 'agent-eval/scenario']
              const images = await docker.listImages().then(images => {
                return images.filter(image => {
                  return image.RepoTags?.some(tag => {
                    return tagGroups.some(group => {
                      return tag.startsWith(group)
                    })
                  })
                })
              })

              for (const image of images) {
                if (image.RepoTags === undefined) {
                  throw new Error(`Image ${image.Id} has no tags`)
                }

                const [tag] = image.RepoTags

                logger.info('Removing image with tag: %s', tag)
                const dockerImage = docker.getImage(tag)
                await dockerImage.remove()
              }
            }
          },
        }),
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
