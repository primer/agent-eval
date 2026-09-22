import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const website = fileURLToPath(new URL('../website/', import.meta.url))
process.chdir(website)
process.env.NODE_ENV = 'production'
const {staticFiles} = await import('../website/dist/server/entry-server.js')
const template = await fs.readFile(path.join(website, 'dist/client/index.html'), 'utf8')
const output = path.join(website, 'out')
await fs.rm(output, {recursive: true, force: true})
await fs.cp(path.join(website, 'dist/client'), output, {recursive: true})
let count = 0
for await (const file of staticFiles(template)) {
  const target = path.resolve(output, file.path)
  if (!target.startsWith(`${output}${path.sep}`)) throw new Error(`Unsafe export path: ${file.path}`)
  await fs.mkdir(path.dirname(target), {recursive: true})
  await fs.writeFile(target, file.content)
  count++
}
console.log(`Exported ${count} static pages and assets to website/out`)
