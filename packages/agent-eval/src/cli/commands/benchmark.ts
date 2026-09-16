import path from 'node:path'
import {defineCommand} from 'citty'
import {getBenchmark} from '../../benchmark/get'
import {createBenchmarkReport} from '../../benchmark/report'
import {
  benchmarksOption,
  copilotConcurrencyOption,
  containerConcurrencyOption,
  dockerImageOption,
  getConcurrencyValue,
  getOutputPath,
  githubCopilotTokenOption,
  getCopilotToken,
  outputDirectoryOption,
  scenariosOption,
  runnerOption,
  shardOption,
} from '../options'
import {logger} from '../../logger'
import {parseShard} from '../../shard'
import {createBenchmarkPlan, createBenchmarkPlanManifest, parseBenchmarkPlanManifest} from '../../benchmark/plan'
import {
  createBenchmarkOutput,
  listBenchmarkOutputFiles,
  mergeBenchmarkOutputFiles,
  writeBenchmarkOutput,
} from '../../benchmark/output'
import {createPlanFromManifest, runPlan} from '../../plan'
import {DefaultHost as host} from '../../host'

const benchmarkCommand = defineCommand({
  meta: {
    name: 'benchmark',
    description: 'Run and plan benchmarks',
  },
  subCommands: {
    merge: defineCommand({
      meta: {
        name: 'merge',
        description: 'Merge benchmark results from a sharded plan into a single result',
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

        const outputs = await listBenchmarkOutputFiles({
          outputDirectory,
        })
        const outputFiles = outputs.map(outputFile => {
          return outputFile[0]
        })
        const output = await mergeBenchmarkOutputFiles({
          outputs: outputFiles,
          outputDirectory,
        })
        await writeBenchmarkOutput({
          output,
          outputPath,
        })
        const outputFilePaths = outputs.map(outputFile => {
          return outputFile[1]
        })

        for (const outputFilePath of outputFilePaths) {
          logger.debug('Deleting benchmark shard output file: %s', path.relative(process.cwd(), outputFilePath))
          await host.fs.unlink(outputFilePath)
        }

        logger.info('Successfully merged benchmark results into: %s', path.relative(process.cwd(), outputPath))
      },
    }),
    plan: defineCommand({
      meta: {
        name: 'plan',
        description: 'Create a plan for a benchmark run that can be ran later across machines',
      },
      subCommands: {
        create: defineCommand({
          meta: {
            name: 'plan',
            description: 'Create a benchmark plan',
          },
          args: {
            benchmarks: benchmarksOption,
            name: {
              type: 'positional',
              description: 'The name of the benchmark to plan',
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
            logger.info(`Planning benchmark: %s`, args.name)

            const benchmarksDirectory = path.resolve(args.benchmarks)
            const scenariosDirectory = path.resolve(args.scenarios)
            const outputPath = path.resolve(args['output-path'])

            logger.debug({
              benchmarksDirectory,
              scenariosDirectory,
              outputPath,
            })

            const benchmark = await getBenchmark({
              benchmarksDirectory,
              scenariosDirectory,
              name: args.name,
            })
            const plan = createBenchmarkPlan({
              benchmark,
              runner: args.runner,
            })
            const manifest = createBenchmarkPlanManifest({
              benchmark,
              plan,
            })
            const contents = JSON.stringify(manifest, null, 2)

            await host.fs.mkdir(path.dirname(outputPath), {
              recursive: true,
            })
            await host.fs.writeFile(outputPath, contents, 'utf-8')

            logger.info('Wrote benchmark plan to: %s', path.relative(process.cwd(), outputPath))
          },
        }),
        run: defineCommand({
          meta: {
            name: 'run',
            description: 'Run a description plan from a manifest',
          },
          args: {
            benchmarks: benchmarksOption,
            'copilot-concurrency': copilotConcurrencyOption,
            'container-concurrency': containerConcurrencyOption,
            'docker-image': dockerImageOption,
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
            const benchmarksDirectory = path.resolve(args.benchmarks)
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
              benchmarksDirectory,
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
            const manifest = await parseBenchmarkPlanManifest({
              benchmarksDirectory,
              contents,
              scenariosDirectory,
            })

            logger.info(
              'Running benchmark: %s %s',
              manifest.benchmark.name,
              shard ? `(${shard.order}/${shard.total})` : '',
            )

            const plan = createPlanFromManifest({
              shard,
              trials: manifest.trials,
              runner: args.runner,
            })
            const runPlanResult = await runPlan({
              artifactsDirectory,
              copilotConcurrency,
              containerConcurrency,
              copilotToken,
              dockerImage: args['docker-image'],
              plan,
            })
            const output = createBenchmarkOutput({
              benchmark: manifest.benchmark,
              runPlanResult,
            })
            await writeBenchmarkOutput({
              output,
              outputPath,
            })
            process.stdout.write(`${createBenchmarkReport({benchmark: manifest.benchmark, runPlanResult})}\n`)
          },
        }),
      },
    }),
    run: defineCommand({
      meta: {
        name: 'run',
        description: 'Run a benchmark',
      },
      args: {
        benchmarks: benchmarksOption,
        'copilot-concurrency': copilotConcurrencyOption,
        'container-concurrency': containerConcurrencyOption,
        'docker-image': dockerImageOption,
        name: {
          type: 'positional',
          description: 'The name of the benchmark to run',
          required: true,
        },
        'output-dir': outputDirectoryOption,
        scenarios: scenariosOption,
        runner: runnerOption,
        token: githubCopilotTokenOption,
      },
      async run({args}) {
        logger.info(`Running benchmark: %s`, args.name)

        const benchmarksDirectory = path.resolve(args.benchmarks)
        const copilotConcurrency = getConcurrencyValue(args['copilot-concurrency'], 'copilot-concurrency')
        const containerConcurrency = getConcurrencyValue(args['container-concurrency'], 'container-concurrency')
        const scenariosDirectory = path.resolve(args.scenarios)
        const resultsDirectory = path.resolve(args['output-dir'])
        const artifactsDirectory = path.join(resultsDirectory, 'artifacts')
        const outputPath = getOutputPath(resultsDirectory)
        const copilotToken = getCopilotToken(args.token)

        logger.debug({
          artifactsDirectory,
          benchmarksDirectory,
          copilotConcurrency,
          containerConcurrency,
          outputPath,
          resultsDirectory,
          scenariosDirectory,
        })

        const benchmark = await getBenchmark({
          benchmarksDirectory,
          scenariosDirectory,
          name: args.name,
        })
        const plan = createBenchmarkPlan({
          benchmark,
          runner: args.runner,
        })
        const runPlanResult = await runPlan({
          artifactsDirectory,
          copilotConcurrency,
          containerConcurrency,
          copilotToken,
          dockerImage: args['docker-image'],
          plan,
        })
        const output = createBenchmarkOutput({
          benchmark,
          runPlanResult,
        })
        await writeBenchmarkOutput({
          output,
          outputPath,
        })
        process.stdout.write(`${createBenchmarkReport({benchmark, runPlanResult})}\n`)
      },
    }),
  },
})

export {benchmarkCommand as benchmark}
