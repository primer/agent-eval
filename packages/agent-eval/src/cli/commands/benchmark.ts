import fs from 'node:fs/promises'
import path from 'node:path'
import {defineCommand} from 'citty'
import {
  benchmarksOption,
  concurrencyOption,
  dockerImageOption,
  experimentsOption,
  getConcurrencyValue,
  getOutputPath,
  githubCopilotTokenOption,
  getCopilotToken,
  outputDirectoryOption,
  // planOption,
  scenariosOption,
  shardOption,
} from '../options'
import {logger} from '../../logger'
import {parseShard} from '../../shard'
import {getBenchmark} from '../../benchmark'
import {createBenchmarkPlan} from '../../benchmark/plan'
import {createBenchmarkOutput, writeBenchmarkOutput} from '../../benchmark/output'
import {runPlan} from '../../plan'

export const benchmark = defineCommand({
  meta: {
    name: 'benchmark',
  },
  subCommands: {
    // plan: defineCommand({
    //   meta: {
    //     name: 'plan',
    //     description: 'Plan a benchmark',
    //   },
    //   args: {
    //     name: {
    //       type: 'positional',
    //       description: 'The name of the benchmark to plan',
    //     },
    //     'output-path': {
    //       type: 'string',
    //       description: 'The path to write the plan to',
    //       default: 'plan.json',
    //     },
    //   },
    //   async run({args}) {
    //     logger.info(`Planning benchmark: %s`, args.name)
    //   },
    // }),
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
