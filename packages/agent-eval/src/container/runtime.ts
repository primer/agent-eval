import Docker from 'dockerode'
import Queue from 'p-queue'
import {ContainerImage} from './image'
import type {BuildImageOptions} from './image'
import type {Client} from './client'
import {Container, RunningContainer, type CreateContainerOptions} from './container'

/**
 * A container runtime that builds images, create containers, and manages their lifecycle.
 */
type ContainerRuntime = {
  buildImage: (context: NodeJS.ReadableStream, options: BuildImageOptions) => Promise<ContainerImage>
  buildImageFromDockerfile: (dockerfile: string, options: BuildImageOptions) => Promise<ContainerImage>
  client: Client
  createContainer: (options: Omit<CreateContainerOptions, 'client'>) => Promise<Container>
  startContainer: (container: Container) => Promise<RunningContainer>
}

type CreateContainerRuntimeOptions = {
  buildConcurrency: number
}

function createContainerRuntime({buildConcurrency}: CreateContainerRuntimeOptions): ContainerRuntime {
  const client = new Docker()
  const buildQueue = new Queue({
    concurrency: buildConcurrency,
  })

  return {
    buildImage: (...args) => {
      return buildQueue.add(() => {
        return ContainerImage.build(client, ...args)
      })
    },
    buildImageFromDockerfile: (...args) => {
      return buildQueue.add(() => {
        return ContainerImage.buildFromDockerfile(client, ...args)
      })
    },
    client,
    createContainer: options => {
      return Container.create({
        ...options,
        client,
      })
    },
    startContainer: container => {
      return RunningContainer.start(client, container)
    },
  }
}

export {createContainerRuntime}
export type {ContainerRuntime}
