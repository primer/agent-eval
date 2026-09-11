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
  planOption,
  scenariosOption,
  shardOption,
} from '../options'
import {logger} from '../../logger'
import {parseShard} from '../../shard'
import {getBenchmark, run as runBenchmark, createPlan} from '../../benchmark'
import {BenchmarkPlanSchema, deserializePlan} from '../..'

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
        experiments: experimentsOption,
        name: {
          type: 'positional',
          description: 'The name of the benchmark to run',
          required: true,
        },
        'output-dir': outputDirectoryOption,
        // plan: planOption,
        scenarios: scenariosOption,
        shard: shardOption,
        token: githubCopilotTokenOption,
      },
      async run({args}) {
        logger.info(`Running benchmark: %s`, args.name)

        const benchmarksDirectory = path.resolve(args.benchmarks)
        const concurrency = getConcurrencyValue(args.concurrency)
        const experimentsDirectory = path.resolve(args.experiments)
        const scenariosDirectory = path.resolve(args.scenarios)
        const resultsDirectory = path.resolve(args['output-dir'])
        const shard = args.shard ? parseShard(args.shard) : undefined
        const outputPath = getOutputPath(resultsDirectory, shard)
        const copilotToken = getCopilotToken(args.token)

        const benchmark = await getBenchmark({
          benchmarksDirectory,
          scenariosDirectory,
          name: args.name,
        })
        const plan = createPlan(benchmark)
        // await runBenchmarkPlan({
        //   //
        // })

        // let plan = undefined
        // if (args.plan) {
        //   const planPath = path.resolve(args.plan)
        //   const data = await fs.readFile(planPath, 'utf-8')
        //   plan = BenchmarkPlanSchema.parse(JSON.parse(data))
        // }
        //
        // const result = await runBenchmark({
        // //   benchmarksDirectory,
        // //   concurrency,
        // //   copilotToken,
        // //   dockerImage: args['docker-image'],
        // })
      },
    }),
  },
})
