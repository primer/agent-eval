import path from 'node:path'
import {defineCommand} from 'citty'
import {getExperiment} from '../../experiment/get'
import {createExperimentReport} from '../../experiment/report'
import {
  createExperimentOutput,
  listExperimentOutputFiles,
  mergeExperimentOutputFiles,
  writeExperimentOutput,
} from '../../experiment/output'
import {createExperimentPlan, createExperimentPlanManifest, parseExperimentPlanManifest} from '../../experiment/plan'
import {DefaultHost as host} from '../../host'
import {logger} from '../../logger'
import {createPlanFromManifest, runPlan} from '../../plan'
import {parseShard} from '../../shard'
import {
  copilotConcurrencyOption,
  containerConcurrencyOption,
  experimentsOption,
  getConcurrencyValue,
  getCopilotToken,
  getOutputPath,
  githubCopilotTokenOption,
  outputDirectoryOption,
  scenariosOption,
  runnerOption,
  shardOption,
} from '../options'

const experimentCommand = defineCommand({
  meta: {
    name: 'experiment',
    description: 'Run and plan experiments',
  },
  subCommands: {
    merge: defineCommand({
      meta: {
        name: 'merge',
        description: 'Merge experiment results from a sharded plan into a single result',
      },
      args: {
        'output-dir': outputDirectoryOption,
      },
      async run({args}) {
        const outputDirectory = path.resolve(args['output-dir'])
        const outputPath = getOutputPath(outputDirectory)

        logger.debug({
          outputDirectory,
          outputPath,
        })

        const outputs = await listExperimentOutputFiles({outputDirectory})
        const output = await mergeExperimentOutputFiles({
          outputs: outputs.map(([shardOutput]) => {
            return shardOutput
          }),
          outputDirectory,
        })
        await writeExperimentOutput({
          output,
          outputPath,
        })

        for (const [, outputFilePath] of outputs) {
          logger.debug('Deleting experiment shard output file: %s', path.relative(process.cwd(), outputFilePath))
          await host.fs.unlink(outputFilePath)
        }

        logger.info('Successfully merged experiment results into: %s', path.relative(process.cwd(), outputPath))
      },
    }),
    plan: defineCommand({
      meta: {
        name: 'plan',
        description: 'Create and run experiment plans',
      },
      subCommands: {
        create: defineCommand({
          meta: {
            name: 'create',
            description: 'Create an experiment plan',
          },
          args: {
            experiments: experimentsOption,
            name: {
              type: 'positional',
              description: 'The name of the experiment to plan',
              required: true,
            },
            'output-path': {
              type: 'string',
              description: 'The path to write the plan to',
              default: 'plan.json',
            },
            scenarios: scenariosOption,
            runner: runnerOption,
          },
          async run({args}) {
            logger.info('Planning experiment: %s', args.name)

            const experimentsDirectory = path.resolve(args.experiments)
            const scenariosDirectory = path.resolve(args.scenarios)
            const outputPath = path.resolve(args['output-path'])

            logger.debug({
              experimentsDirectory,
              scenariosDirectory,
              outputPath,
            })

            const experiment = await getExperiment({
              experimentsDirectory,
              scenariosDirectory,
              name: args.name,
            })
            const plan = createExperimentPlan({experiment, runner: args.runner})
            const manifest = createExperimentPlanManifest({experiment, plan})

            await host.fs.mkdir(path.dirname(outputPath), {recursive: true})
            await host.fs.writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf-8')

            logger.info('Wrote experiment plan to: %s', path.relative(process.cwd(), outputPath))
          },
        }),
        run: defineCommand({
          meta: {
            name: 'run',
            description: 'Run an experiment plan from a manifest',
          },
          args: {
            experiments: experimentsOption,
            'copilot-concurrency': copilotConcurrencyOption,
            'container-concurrency': containerConcurrencyOption,
            'output-dir': outputDirectoryOption,
            'plan-path': {
              type: 'string',
              description: 'The path to the plan to run',
              default: './plan.json',
            },
            scenarios: scenariosOption,
            runner: runnerOption,
            shard: shardOption,
            token: githubCopilotTokenOption,
          },
          async run({args}) {
            const experimentsDirectory = path.resolve(args.experiments)
            const copilotConcurrency = getConcurrencyValue(args['copilot-concurrency'], 'copilot-concurrency')
            const containerConcurrency = getConcurrencyValue(args['container-concurrency'], 'container-concurrency')
            const scenariosDirectory = path.resolve(args.scenarios)
            const resultsDirectory = path.resolve(args['output-dir'])
            const artifactsDirectory = path.join(resultsDirectory, 'artifacts')
            const shard = args.shard ? parseShard(args.shard) : undefined
            const outputPath = getOutputPath(resultsDirectory, shard)
            const copilotToken = getCopilotToken(args.token)
            const planPath = path.resolve(args['plan-path'])

            logger.debug({
              artifactsDirectory,
              experimentsDirectory,
              copilotConcurrency,
              containerConcurrency,
              outputPath,
              resultsDirectory,
              scenariosDirectory,
              shard,
            })

            logger.info('Parsing plan manifest from: %s', path.relative(process.cwd(), planPath))
            if (!host.existsSync(planPath)) {
              throw new Error(`Plan file does not exist: ${planPath}`)
            }

            const contents = await host.fs.readFile(planPath, 'utf-8')
            const manifest = await parseExperimentPlanManifest({
              experimentsDirectory,
              contents,
              scenariosDirectory,
            })

            logger.info(
              'Running experiment: %s %s',
              manifest.experiment.name,
              shard ? `(${shard.order}/${shard.total})` : '',
            )

            const plan = createPlanFromManifest({shard, trials: manifest.trials, runner: args.runner})
            const runPlanResult = await runPlan({
              artifactsDirectory,
              copilotConcurrency,
              containerConcurrency,
              copilotToken,
              plan,
            })
            const output = createExperimentOutput({experiment: manifest.experiment, runPlanResult})
            await writeExperimentOutput({output, outputPath})
            process.stdout.write(`${createExperimentReport({experiment: manifest.experiment, runPlanResult})}\n`)
          },
        }),
      },
    }),
    run: defineCommand({
      meta: {
        name: 'run',
        description: 'Run an experiment',
      },
      args: {
        experiments: experimentsOption,
        'copilot-concurrency': copilotConcurrencyOption,
        'container-concurrency': containerConcurrencyOption,
        name: {
          type: 'positional',
          description: 'The name of the experiment to run',
          required: true,
        },
        'output-dir': outputDirectoryOption,
        scenarios: scenariosOption,
        runner: runnerOption,
        token: githubCopilotTokenOption,
      },
      async run({args}) {
        logger.info('Running experiment: %s', args.name)

        const experimentsDirectory = path.resolve(args.experiments)
        const copilotConcurrency = getConcurrencyValue(args['copilot-concurrency'], 'copilot-concurrency')
        const containerConcurrency = getConcurrencyValue(args['container-concurrency'], 'container-concurrency')
        const scenariosDirectory = path.resolve(args.scenarios)
        const resultsDirectory = path.resolve(args['output-dir'])
        const artifactsDirectory = path.join(resultsDirectory, 'artifacts')
        const outputPath = getOutputPath(resultsDirectory)
        const copilotToken = getCopilotToken(args.token)

        logger.debug({
          artifactsDirectory,
          experimentsDirectory,
          copilotConcurrency,
          containerConcurrency,
          outputPath,
          resultsDirectory,
          scenariosDirectory,
        })

        const experiment = await getExperiment({
          experimentsDirectory,
          scenariosDirectory,
          name: args.name,
        })
        const plan = createExperimentPlan({experiment, runner: args.runner})
        const runPlanResult = await runPlan({
          artifactsDirectory,
          copilotConcurrency,
          containerConcurrency,
          copilotToken,
          plan,
        })
        const output = createExperimentOutput({experiment, runPlanResult})
        await writeExperimentOutput({
          output,
          outputPath,
        })
        process.stdout.write(`${createExperimentReport({experiment, runPlanResult})}\n`)
      },
    }),
  },
})

export {experimentCommand as experiment}
