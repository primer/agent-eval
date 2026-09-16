import {
  defineConfig as defineBenchmarkConfig,
  type BenchmarkConfig as InternalBenchmarkConfig,
} from './benchmark/config'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Preserve the public name during declaration emit.
interface BenchmarkConfig extends InternalBenchmarkConfig {}

const defineConfig: (config: BenchmarkConfig) => BenchmarkConfig = defineBenchmarkConfig

export {defineConfig}
export type {BenchmarkConfig}
