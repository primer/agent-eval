import {defineConfig} from 'rolldown/config'
import {dts} from 'rolldown-plugin-dts'
import packageJson from './package.json' with {type: 'json'}

const bundledDependencies = new Set([
  '@primer/agent-scenarios',
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

const config = defineConfig({
  input: {
    cli: 'src/cli.ts',
    config: 'src/config.ts',
    index: 'src/index.ts',
    scenario: 'src/scenario-config.ts',
  },
  platform: 'node',
  external,
  plugins: [dts({eager: true, sourcemap: true})],
  output: {
    dir: 'dist',
    entryFileNames: '[name].js',
  },
})

export default config
