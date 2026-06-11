import {defineConfig} from 'rolldown/config'
import packageJson from './package.json' with {type: 'json'}

const bundledDependencies = new Set([
  '@primer/agent-evals',
  '@primer/agent-experiment',
  '@primer/agent-experiments',
  '@primer/agent-sandbox',
])
const dependencies = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)].filter(
  name => {
    return !bundledDependencies.has(name)
  },
)
const external = dependencies.map(name => {
  return new RegExp(`^${name}(/.*)?`)
})

export default defineConfig({
  input: {
    cli: 'src/cli.ts',
    config: 'src/config.ts',
  },
  platform: 'node',
  external,
  output: {
    dir: 'dist',
    entryFileNames: '[name].js',
  },
})
