import {randomUUID} from 'node:crypto'
import path from 'node:path'
import type Docker from 'dockerode'
import dockerignore from '@balena/dockerignore'
import tarFs from 'tar-fs'
import type {Host} from '../host'
import {logger} from '../logger'
import {isPathInside} from '../path'
import type {SandboxCreateOptions} from './types'

type DockerBuild = NonNullable<SandboxCreateOptions['dockerBuild']>

async function validateDockerBuild(host: Host, {context, dockerfile}: DockerBuild): Promise<void> {
  if (!(await host.fs.stat(context)).isDirectory()) {
    throw new Error(`Docker build context is not a directory: ${context}`)
  }
  if (!(await host.fs.stat(dockerfile)).isFile()) {
    throw new Error(`Dockerfile is not a file: ${dockerfile}`)
  }
  if (
    !isPathInside(context, dockerfile) ||
    !isPathInside(await host.fs.realpath(context), await host.fs.realpath(dockerfile))
  ) {
    throw new Error(`Dockerfile must be inside the build context: ${dockerfile}`)
  }
}

async function buildLocalDockerImage(docker: Docker, host: Host, options: DockerBuild): Promise<string> {
  const context = path.resolve(options.context)
  const dockerfile = path.resolve(options.dockerfile)
  await validateDockerBuild(host, {context, dockerfile})

  const image = `agent-eval-workspace:${randomUUID()}`
  logger.info('Building workspace image from %s (context: %s)', dockerfile, context)

  const specificIgnoreFile = `${dockerfile}.dockerignore`
  const ignoreFile = host.existsSync(specificIgnoreFile) ? specificIgnoreFile : path.join(context, '.dockerignore')
  const ignored = dockerignore({ignorecase: false})
  if (host.existsSync(ignoreFile)) {
    ignored.add(await host.fs.readFile(ignoreFile, 'utf8'))
  }
  const archive = tarFs.pack(context, {
    ignore(name) {
      const absolute = path.resolve(name)
      const relative = path.relative(context, absolute).split(path.sep).join(path.posix.sep)
      if (!relative || absolute === dockerfile || absolute === ignoreFile || isPathInside(absolute, dockerfile)) {
        return false
      }
      return ignored.ignores(relative)
    },
  })

  const stream = await docker.buildImage(archive, {
    dockerfile: path.relative(context, dockerfile).split(path.sep).join(path.posix.sep),
    t: image,
  })

  await waitForDockerBuild(docker, stream)

  return image
}

async function waitForDockerBuild(docker: Docker, stream: NodeJS.ReadableStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (error, output: Array<unknown> = []) => {
      if (error) {
        reject(error)
        return
      }
      for (const entry of output) {
        if (entry && typeof entry === 'object' && 'error' in entry && typeof entry.error === 'string') {
          reject(new Error(entry.error))
          return
        }
      }
      resolve()
    })
  })
}

export {buildLocalDockerImage, validateDockerBuild, waitForDockerBuild}
