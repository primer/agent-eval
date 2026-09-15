import {defineConfig} from 'rolldown/config'
import {dts} from 'rolldown-plugin-dts'
import packageJson from './package.json' with {type: 'json'}

const dependencies = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
const external = dependencies.map(name => {
  return new RegExp(`^${name}(/.*)?`)
})

const config = defineConfig({
  input: {
    benchmark: 'src/benchmark.ts',
    cli: 'src/cli.ts',
    experiment: 'src/experiment.ts',
    index: 'src/index.ts',
    scenario: 'src/scenario.ts',
  },
  platform: 'node',
  external,
  plugins: [dts({eager: true, sourcemap: true})],
  output: {
    dir: 'dist',
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
})

export default config
