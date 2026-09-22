import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import * as z from 'zod/mini'
import {isPathInside} from '../path'
import {logger} from '../logger'
import {readResults} from './results'
import {renderPage, revision} from './page'

async function parseDirectory(input: string, allowMissing: boolean): Promise<string> {
  const directory = path.resolve(input)
  try {
    if (!(await fs.stat(directory)).isDirectory()) {
      throw new Error(`Expected a results directory: ${directory}`)
    }
    return await fs.realpath(directory)
  } catch (err) {
    if (allowMissing && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return directory
    }
    throw err
  }
}

async function startUi(input: string, portInput: string): Promise<http.Server> {
  const port = z
    .pipe(
      z.pipe(z.string().check(z.regex(/^\d+$/)), z.transform(Number)),
      z.number().check(z.int(), z.minimum(0), z.maximum(65535)),
    )
    .parse(portInput)
  const directory = await parseDirectory(input, true)
  const server = http.createServer((request, response) => {
    void (async () => {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      if (request.headers.host !== `127.0.0.1:${(server.address() as {port: number}).port}`) {
        response.writeHead(403).end()
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, {Allow: 'GET, HEAD'}).end()
        return
      }
      const pathname = (request.url ?? '/').split('?')[0]
      if (pathname !== '/' && pathname !== '/__revision') {
        response.writeHead(404).end()
        return
      }
      try {
        const results = await readResults(directory)
        response.setHeader('Content-Type', pathname === '/' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8')
        response.end(
          request.method === 'HEAD' ? undefined : pathname === '/' ? renderPage(results, true) : revision(results),
        )
      } catch (err) {
        logger.error({err}, 'Unable to read UI results')
        response.writeHead(500).end('Unable to read results')
      }
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  return server
}

async function buildUi(input: string, output: string): Promise<string> {
  const directory = await parseDirectory(input, false)
  const destination = path.resolve(output)
  // Resolve existing ancestors as well, so a symlink cannot make output overwrite inputs.
  async function resolveDestination(filepath: string): Promise<string> {
    try {
      return await fs.realpath(filepath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
      return path.join(await resolveDestination(path.dirname(filepath)), path.basename(filepath))
    }
  }
  const realDestination = await resolveDestination(destination)
  if (isPathInside(directory, realDestination) || isPathInside(realDestination, directory)) {
    throw new Error('The UI output directory must not overlap the results directory')
  }
  const results = await readResults(directory)
  if (results.errors.length > 0) {
    throw new Error(results.errors.map(error => `${error.file}: ${error.message}`).join('\n'))
  }
  await fs.mkdir(destination, {recursive: true})
  await fs.writeFile(path.join(destination, 'index.html'), renderPage(results))
  await fs.writeFile(path.join(destination, '.nojekyll'), '')
  return destination
}

export {startUi, buildUi}
