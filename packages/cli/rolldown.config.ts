import {createRequire} from 'node:module'
import {defineConfig} from 'rolldown/config'
import {dts} from 'rolldown-plugin-dts'
import packageJson from './package.json' with {type: 'json'}
import corePackageJson from '@primer/agent-eval-core/package.json' with {type: 'json'}

const require = createRequire(import.meta.url)

const dependencies = [
  ...Object.keys(packageJson.dependencies),
  ...Object.keys(packageJson.devDependencies),
  ...Object.keys(corePackageJson.dependencies),
  ...Object.keys(corePackageJson.devDependencies),
].filter(name => {
  return !name.startsWith('@primer/agent-eval-')
})
const external = dependencies.map(name => {
  return new RegExp(`^${name}(/.*)?`)
})

const config = defineConfig([
  {
    input: {
      benchmark: 'src/benchmark.ts',
      cli: 'src/cli.ts',
      experiment: 'src/experiment.ts',
      index: 'src/index.ts',
      scenario: 'src/scenario.ts',
    },
    platform: 'node',
    external,
    plugins: [
      dts({
        eager: true,
        emitDtsOnly: true,
        sourcemap: true,
      }),
    ],
    output: {
      dir: 'dist',
    },
  },
  {
    input: require.resolve('@primer/agent-eval-core/sandbox/glob-script'),
    platform: 'node',
    output: {
      file: 'dist/sandbox/glob-script.mjs',
      format: 'esm',
    },
  },
])

export default config
