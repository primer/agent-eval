import {StringDecoder} from 'node:string_decoder'
import {Writable} from 'node:stream'

type CapturedStream = {
  stream: Writable
  read(): string
  flush(): void
}

function createCapturedStream(onLine: (line: string) => void): CapturedStream {
  const chunks: Array<Buffer> = []
  const decoder = new StringDecoder('utf8')
  let pending = ''

  function emitLines(final: boolean): void {
    while (pending.length > 0) {
      const delimiterIndex = pending.search(/[\r\n]/)
      if (delimiterIndex === -1) {
        break
      }

      if (pending[delimiterIndex] === '\r' && delimiterIndex === pending.length - 1 && !final) {
        break
      }

      const delimiterLength = pending.slice(delimiterIndex, delimiterIndex + 2) === '\r\n' ? 2 : 1
      onLine(pending.slice(0, delimiterIndex))
      pending = pending.slice(delimiterIndex + delimiterLength)
    }

    if (final && pending.length > 0) {
      onLine(pending)
      pending = ''
    }
  }

  const stream = new Writable({
    write(chunk: Buffer | string, encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
      chunks.push(buffer)
      pending += decoder.write(buffer)
      emitLines(false)
      callback()
    },
  })

  return {
    stream,
    read() {
      return Buffer.concat(chunks).toString('utf8')
    },
    flush() {
      pending += decoder.end()
      emitLines(true)
    },
  }
}

export {createCapturedStream}
