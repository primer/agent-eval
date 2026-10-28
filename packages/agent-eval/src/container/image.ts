import {Readable} from 'node:stream'
import type Docker from 'dockerode'
import tarStream from 'tar-stream'
import type {Client} from './client'
import type {ImageReference} from './image-reference'
import {Newtype} from '../newtype'
import {debug} from '../logger'

type BuildImageOptions = Omit<Docker.ImageBuildOptions, 't'> & {
  t: ImageReference
}

class ContainerImage extends Newtype<'ContainerImage', string> {
  static async build(
    client: Client,
    context: NodeJS.ReadableStream,
    {t, ...buildOptions}: BuildImageOptions,
  ): Promise<ContainerImage> {
    const stream = await client.buildImage(context, {
      ...buildOptions,
      t: t.unwrap(),
    })

    await new Promise<void>((resolve, reject) => {
      client.modem.followProgress(
        stream,
        error => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        },
        event => {
          if (event.stream) {
            // Trim trailing newlines
            const message = event.stream.replace(/[\r\n]+$/, '')
            if (message) {
              debug('[docker] %s', message)
            }
          }
        },
      )
    })

    return new ContainerImage(t.unwrap())
  }

  static async buildFromDockerfile(
    client: Client,
    dockerfile: string,
    options: BuildImageOptions,
  ): Promise<ContainerImage> {
    const contents = Buffer.from(dockerfile)
    const context = tarStream.pack()
    context.entry(
      {
        name: 'Dockerfile',
        size: contents.byteLength,
      },
      contents,
    )
    context.finalize()

    const stream = Readable.from(context, {
      objectMode: false,
    })

    return await ContainerImage.build(client, stream, {
      ...options,
      dockerfile: 'Dockerfile',
    })
  }
}

export {ContainerImage}
export type {BuildImageOptions}
