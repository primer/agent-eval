import {defineConfig} from 'rolldown/config'
import type {RolldownOptions} from 'rolldown'
import packageJson from './package.json' with {type: 'json '}

const dependencies = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
const external = dependencies.map(name => {
  return new RegExp(`^${name}(/.*)?`)
})

const config: RolldownOptions = defineConfig({
  input: 'src/cli.ts',
  platform: 'node',
  external,
  output: {
    dir: 'dist',
  },
})

export default config
