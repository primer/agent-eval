import path from 'node:path'
import {globSync} from 'glob'
import {defineConfig} from 'rolldown'
import {dts} from 'rolldown-plugin-dts'
import packageJson from './package.json' with {type: 'json'}

const dependencies = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
const external = dependencies.map(name => {
  return new RegExp(`^${name}(/.*)?`)
})

const SOURCE_DIRECTORY = path.join(import.meta.dirname, 'src')
const input = Object.fromEntries(
  globSync(['**/*.{ts,tsx}'], {
    cwd: SOURCE_DIRECTORY,
    ignore: ['**/*.test.{ts,tsx}'],
  }).map(match => {
    return [
      path.join(path.dirname(match), path.basename(match, path.extname(match))),
      path.join(SOURCE_DIRECTORY, match),
    ]
  }),
)

input['next.config'] = path.join(import.meta.dirname, 'next.config.ts')

export default defineConfig({
  input,
  platform: 'node',
  external,
  plugins: [dts({sourcemap: true})],
  output: {
    dir: 'dist',
    format: 'esm',
  },
})
