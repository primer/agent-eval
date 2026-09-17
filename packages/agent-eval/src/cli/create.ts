import {execFile} from 'node:child_process'
import path from 'node:path'
import {promisify} from 'node:util'
import {defineCommand} from 'citty'
import {DefaultHost as host} from '../host'
import {logger} from '../logger'
import {benchmarksOption, experimentsOption, scenariosOption} from './options'

const exec = promisify(execFile)

const createOptions = {
  name: {
    type: 'positional',
    description: 'The filename or folder name to create (lowercase letters, numbers, hyphens, and underscores)',
    required: true,
  },
  description: {
    type: 'string',
    description: 'A description of what this evaluation tests',
    default: '',
  },
} as const

function validateName(name: string) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
    throw new Error('Expected a name starting with a lowercase letter or number, using only a-z, 0-9, - and _')
  }
}

function configSource(kind: string, config: unknown) {
  return `import {defineConfig} from '@primer/agent-eval/${kind}'\n\nexport default defineConfig(${JSON.stringify(config, null, 2)})\n`
}

async function writeConfig(directory: string, name: string, kind: string, config: unknown) {
  validateName(name)
  if (name === 'index') {
    throw new Error(`The name "index" is reserved and cannot be used for a ${kind}`)
  }
  const filepath = path.resolve(directory, `${name}.ts`)
  await host.fs.mkdir(path.dirname(filepath), {recursive: true})
  await host.fs.writeFile(filepath, configSource(kind, config), {flag: 'wx'})
  logger.info('Created %s: %s', kind, filepath)
}

const createBenchmark = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a benchmark configuration',
  },
  args: {
    ...createOptions,
    benchmarks: benchmarksOption,
  },
  async run({args}) {
    await writeConfig(args.benchmarks, args.name, 'benchmark', {
      name: args.name,
      description: args.description,
      models: ['gpt-5.5'],
      capabilities: [{name: 'Example capability', scenarios: []}],
    })
    logger.info('Add scenario IDs to the capability and choose models before planning or running the benchmark.')
  },
})

const createExperiment = defineCommand({
  meta: {
    name: 'create',
    description: 'Create an experiment configuration',
  },
  args: {
    ...createOptions,
    experiments: experimentsOption,
  },
  async run({args}) {
    await writeConfig(args.experiments, args.name, 'experiment', {
      name: args.name,
      description: args.description,
      models: ['gpt-5.5'],
      scenarios: [],
      treatments: [],
    })
    logger.info('Add scenario IDs, choose models, and configure treatments before planning or running the experiment.')
  },
})

const createScenario = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a scenario using a Next.js or Vite starter',
  },
  args: {
    ...createOptions,
    scenarios: scenariosOption,
    prompt: {
      type: 'string',
      description: 'The task to give the agent',
      default: 'Describe the task the agent should complete.',
    },
    template: {
      type: 'enum',
      options: ['nextjs', 'vite'],
      description: 'The framework template for the starting workspace',
      default: 'nextjs',
    },
  },
  async run({args}) {
    validateName(args.name)
    const directory = path.resolve(args.scenarios)
    const destination = path.join(directory, args.name)
    await host.fs.mkdir(directory, {recursive: true})
    await host.fs.mkdir(destination)

    try {
      const generatorArgs =
        args.template === 'nextjs'
          ? [
              'create-next-app@16.3.5',
              args.name,
              '--yes',
              '--ts',
              '--app',
              '--empty',
              '--no-tailwind',
              '--no-eslint',
              '--no-react-compiler',
              '--no-src-dir',
              '--no-agents-md',
              '--import-alias',
              '@/*',
              '--use-npm',
              '--skip-install',
              '--disable-git',
            ]
          : ['create-vite@9.2.1', args.name, '--template', 'react-ts', '--no-interactive', '--no-immediate']

      await exec('npx', ['--yes', ...generatorArgs], {cwd: directory})
      await exec('npm', ['pkg', 'set', 'type=module'], {cwd: destination})
      await host.fs.writeFile(
        path.join(destination, 'scenario.config.ts'),
        configSource('scenario', {description: args.description, prompt: args.prompt}),
        {flag: 'wx'},
      )
    } catch (error) {
      await host.fs.rm(destination, {recursive: true, force: true})
      throw error
    }

    logger.info('Created scenario: %s', destination)
    logger.info(
      'Install the scenario dependencies with npm install in that directory. Add checks or judges to grade it.',
    )
  },
})

export {createBenchmark, createExperiment, createScenario}
