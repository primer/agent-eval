import {PassThrough, Readable} from 'node:stream'
import Docker from 'dockerode'
import {afterEach, expect, test, vi} from 'vitest'
import {createContainer} from '../docker'
import {VirtualHost} from '../host'
import {SystemSandbox} from './system'

afterEach(() => {
  vi.restoreAllMocks()
})

async function createSandbox() {
  const container = new Docker().getContainer('test')
  vi.spyOn(Docker.prototype, 'createContainer').mockResolvedValue(container)
  vi.spyOn(container, 'start').mockResolvedValue(undefined)
  vi.spyOn(container, 'remove').mockResolvedValue(undefined)
  const running = await createContainer({image: {tagName: 'test'}})

  return {
    container,
    sandbox: new SystemSandbox(VirtualHost.create(), running),
  }
}

test.each([
  {label: 'empty', contents: ''},
  {label: 'small', contents: 'hello\n'},
  {label: 'large', contents: 'a'.repeat(256 * 1024)},
])('round trips $label files through Docker archive streams', async ({contents}) => {
  const {container, sandbox} = await createSandbox()
  await using resource = sandbox
  let archive: Buffer
  vi.spyOn(container, 'putArchive').mockImplementation(async stream => {
    if (!(stream instanceof Readable)) {
      throw new TypeError('Expected a Node readable stream')
    }
    expect(stream.readableObjectMode).toBe(false)
    archive = Buffer.concat(await stream.toArray())
    return new PassThrough()
  })
  vi.spyOn(container, 'getArchive').mockImplementation(async () => {
    return Readable.from([archive])
  })

  await resource.writeFile('example.txt', contents)

  await expect(resource.readFile('example.txt')).resolves.toBe(contents)
})

test('rejects malformed archives', async () => {
  const {container, sandbox} = await createSandbox()
  await using resource = sandbox
  vi.spyOn(container, 'getArchive').mockResolvedValue(Readable.from([Buffer.from('invalid tar archive')]))

  await expect(resource.readFile('example.txt')).rejects.toThrow('Unexpected end of data')
})

test('propagates archive source errors', async () => {
  const {container, sandbox} = await createSandbox()
  await using resource = sandbox
  const error = new Error('Archive download failed')
  vi.spyOn(container, 'getArchive').mockResolvedValue(
    new Readable({
      read() {
        this.destroy(error)
      },
    }),
  )

  await expect(resource.readFile('example.txt')).rejects.toThrow(error)
})
