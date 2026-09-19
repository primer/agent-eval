import path from 'node:path'
import tarFs from 'tar-fs'
import * as z from 'zod/mini'
import {CheckSchema, type Check} from '../check'
import {JudgeSchema, type Judge} from '../judge'
import {isPathInside} from '../path'
import {DefaultHost, type Host} from '../host'
import {logger} from '../logger'
import {TreatmentSetupSchema, type TreatmentSetup} from '../treatment'
import {DEFAULT_DOCKER_IMAGE, NODE_USER} from '../sandbox/constants'
import {buildImage, getImageReference, type ImageBuild} from '../docker'

type Scenario = {
  id: string
  directory: string
  prompt: string
  description?: string
  tags: Array<string>
  checks: Array<Check>
  judges: Array<Judge>
  image: DockerImage
  setup?: TreatmentSetup
}

type DockerImage =
  {type: 'Reference'; name: string} | {type: 'Build'; dockerfile: string; context: string} | {type: 'Default'}

const DockerImageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Reference'),
    name: z.string(),
  }),
  z.object({
    type: z.literal('Build'),
    dockerfile: z.string(),
    context: z._default(z.string(), '.'),
  }),
  z.object({
    type: z.literal('Default'),
  }),
]) satisfies z.ZodMiniType<DockerImage>

const ScenarioSchema = z.object({
  id: z.string(),
  directory: z.string(),
  prompt: z.string(),
  description: z.optional(z.string()),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckSchema), []),
  judges: z._default(z.array(JudgeSchema), []),
  image: DockerImageSchema,
  setup: z.optional(TreatmentSetupSchema),
}) satisfies z.ZodMiniType<Scenario>

function getScenarioIgnoreFiles(scenario: Scenario): Array<{filepath: string; relativePath: string}> {
  const ignored = new Map<string, string>()

  const scenarioConfigPath = path.join(scenario.directory, 'scenario.config.ts')
  ignored.set(scenarioConfigPath, 'scenario.config.ts')

  const defaultIgnored = new Set(['.cache', '.next', 'dist', '.turbo', 'node_modules'])
  for (const ignoredPath of defaultIgnored) {
    const ignoredFilePath = path.join(scenario.directory, ignoredPath)
    ignored.set(ignoredFilePath, ignoredPath)
  }

  if (scenario.image.type === 'Build' && isPathInside(scenario.directory, scenario.image.dockerfile)) {
    ignored.set(scenario.image.dockerfile, path.relative(scenario.directory, scenario.image.dockerfile))
  }

  for (const check of scenario.checks) {
    for (const file of check.files) {
      ignored.set(file.filepath, file.relativePath)
    }
  }

  for (const judge of scenario.judges) {
    for (const file of judge.files) {
      ignored.set(file.filepath, file.relativePath)
    }
  }

  return Array.from(ignored).map(([filepath, relativePath]) => {
    return {
      filepath,
      relativePath,
    }
  })
}

type BuildScenarioImageOptions = {
  host?: Host
  scenario: Scenario
}

const DEFAULT_DOCKERFILE = `FROM ${DEFAULT_DOCKER_IMAGE}

RUN apt-get update \\
  && apt-get install -y --no-install-recommends ca-certificates chromium curl git \\
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/sandbox/workspace
WORKDIR /home/sandbox/workspace

COPY . .
`

async function getDockerfileContents(host: Host, scenario: Scenario): Promise<string> {
  if (scenario.image.type === 'Default') {
    return DEFAULT_DOCKERFILE
  }

  if (scenario.image.type === 'Reference') {
    return `FROM ${scenario.image.name}

      RUN mkdir -p /home/sandbox/workspace
      WORKDIR /home/sandbox/workspace

      COPY . .
    `
  }

  return await host.fs.readFile(scenario.image.dockerfile, 'utf8')
}

const pendingScenarioBuilds = new WeakMap<Scenario, Promise<ImageBuild>>()

async function buildScenarioImage({host = DefaultHost, scenario}: BuildScenarioImageOptions): Promise<ImageBuild> {
  const pendingScenarioBuild = pendingScenarioBuilds.get(scenario)
  if (pendingScenarioBuild) {
    return pendingScenarioBuild
  }

  const build = async () => {
    const dockerfileContents = await getDockerfileContents(host, scenario)
    const contextDirectory = scenario.image.type === 'Build' ? scenario.image.context : scenario.directory
    const imageTag = getImageReference({
      name: `agent-eval/scenarios/${scenario.id}`,
      dockerfile: dockerfileContents,
      context: path.resolve(contextDirectory),
    })

    logger.info('Building image: %s', imageTag)

    const ignoreFiles = getScenarioIgnoreFiles(scenario)
    if (scenario.image.type === 'Build' && isPathInside(scenario.directory, scenario.image.dockerfile)) {
      ignoreFiles.push({
        filepath: scenario.image.dockerfile,
        relativePath: path.relative(scenario.directory, scenario.image.dockerfile),
      })
    }

    const ignored = new Set(
      ignoreFiles.map(ignoreFile => {
        return ignoreFile.filepath
      }),
    )
    const context = tarFs.pack(contextDirectory, {
      finalize: false,
      ignore(filepath) {
        return ignored.has(filepath)
      },
      finish(pack) {
        pack.entry({name: 'Dockerfile'}, dockerfileContents)
        pack.entry({name: '.dockerignore'}, `Dockerfile\n.dockerignore\n`)
        pack.finalize()
      },
    })

    return await buildImage(context, {
      t: imageTag,
    })
  }
  const promise = build()

  pendingScenarioBuilds.set(scenario, promise)

  return promise.finally(() => {
    pendingScenarioBuilds.delete(scenario)
  })
}

const defaultScenarioSetup: TreatmentSetup = async ({sandbox}) => {
  logger.info('Obfuscating package name')
  await sandbox.runCommand('npm', ['pkg', 'set', `name=example`], {
    user: NODE_USER,
  })

  logger.info('Removing workspace dependency')
  await sandbox.runCommand('npm', ['pkg', 'delete', 'devDependencies.@primer/agent-eval'], {
    user: NODE_USER,
  })

  logger.info('Installing dependencies')
  await sandbox.runCommand('npm', ['install'], {
    user: NODE_USER,
  })

  logger.info('Running build script')
  await sandbox.runCommand('npm', ['run', 'build', '--if-present'], {
    user: NODE_USER,
  })
}

export {ScenarioSchema, getScenarioIgnoreFiles, buildScenarioImage, defaultScenarioSetup}
export type {Scenario}
