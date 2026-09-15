import path from 'node:path'
import {defineCommand} from 'citty'
import {getBenchmark} from '../../benchmark/get'
import {createBenchmarkReport} from '../../benchmark/report'
import {
  benchmarksOption,
  concurrencyOption,
  dockerImageOption,
  getConcurrencyValue,
  getOutputPath,
  githubCopilotTokenOption,
  getCopilotToken,
  outputDirectoryOption,
  scenariosOption,
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

export const benchmark = defineCommand({
  meta: {
    name: 'benchmark',
  },
  subCommands: {
    merge: defineCommand({
      meta: {
        name: 'merge',
        description: 'Merge benchmark results from a sharded plan into a single result',
      },
      args: {
        // benchmarks: benchmarksOption,
        'output-dir': outputDirectoryOption,
        // scenarios: scenariosOption,
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
        const outputFiles = outputs.map(output => {
          return output[0]
        })
        const output = await mergeBenchmarkOutputFiles({
          outputs: outputFiles,
          outputDirectory,
        })
        const outputFilePaths = outputs.map(output => {
          return output[1]
        })

        for (const outputFilePath of outputFilePaths) {
          logger.debug('Deleting benchmark shard output file: %s', path.relative(process.cwd(), outputFilePath))
          await host.fs.unlink(outputFilePath)
        }

        await writeBenchmarkOutput({
          output,
          outputPath,
        })
        logger.info('Successfully merged benchmark results into: %s', path.relative(process.cwd(), outputPath))
      },
    }),

    plan: defineCommand({
      meta: {
        name: 'plan',
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
            concurrency: concurrencyOption,
            'docker-image': dockerImageOption,
            'output-dir': outputDirectoryOption,
            'plan-path': {
              type: 'string',
              description: 'The path to the plan to run',
              default: './plan.json',
            },
            scenarios: scenariosOption,
            shard: shardOption,
            token: githubCopilotTokenOption,
          },
          async run({args}) {
            const benchmarksDirectory = path.resolve(args.benchmarks)
            const concurrency = getConcurrencyValue(args.concurrency)
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
              concurrency,
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
            })
            const runPlanResult = await runPlan({
              artifactsDirectory,
              concurrency,
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
        concurrency: concurrencyOption,
        'docker-image': dockerImageOption,
        name: {
          type: 'positional',
          description: 'The name of the benchmark to run',
          required: true,
        },
        'output-dir': outputDirectoryOption,
        scenarios: scenariosOption,
        token: githubCopilotTokenOption,
      },
      async run({args}) {
        logger.info(`Running benchmark: %s`, args.name)

        const benchmarksDirectory = path.resolve(args.benchmarks)
        const concurrency = getConcurrencyValue(args.concurrency)
        const scenariosDirectory = path.resolve(args.scenarios)
        const resultsDirectory = path.resolve(args['output-dir'])
        const artifactsDirectory = path.join(resultsDirectory, 'artifacts')
        const outputPath = getOutputPath(resultsDirectory)
        const copilotToken = getCopilotToken(args.token)

        logger.debug({
          artifactsDirectory,
          benchmarksDirectory,
          concurrency,
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
        })
        const runPlanResult = await runPlan({
          artifactsDirectory,
          concurrency,
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
