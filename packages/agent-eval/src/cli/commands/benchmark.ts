import path from 'node:path'
import {defineCommand} from 'citty'
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
import {getBenchmark} from '../../benchmark'
import {createBenchmarkPlan, createBenchmarkPlanManifest, parseBenchmarkPlanManifest} from '../../benchmark/plan'
import {createBenchmarkOutput, writeBenchmarkOutput} from '../../benchmark/output'
import {createPlanFromManifest, runPlan} from '../../plan'
import {DefaultHost as host} from '../../host'

export const benchmark = defineCommand({
  meta: {
    name: 'benchmark',
  },
  subCommands: {
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

            logger.info('Running benchmark: %s', manifest.benchmark.name)

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
        shard: shardOption,
        token: githubCopilotTokenOption,
      },
      async run({args}) {
        logger.info(`Running benchmark: %s`, args.name)

        const benchmarksDirectory = path.resolve(args.benchmarks)
        const concurrency = getConcurrencyValue(args.concurrency)
        const scenariosDirectory = path.resolve(args.scenarios)
        const resultsDirectory = path.resolve(args['output-dir'])
        const artifactsDirectory = path.join(resultsDirectory, 'artifacts')
        const shard = args.shard ? parseShard(args.shard) : undefined
        const outputPath = getOutputPath(resultsDirectory, shard)
        const copilotToken = getCopilotToken(args.token)

        logger.debug({
          artifactsDirectory,
          benchmarksDirectory,
          concurrency,
          outputPath,
          resultsDirectory,
          scenariosDirectory,
          shard,
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
      },
    }),
  },
})
