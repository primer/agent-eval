import {defineConfig as defineScenarioConfig, type ScenarioConfig as InternalScenarioConfig} from './scenario/config'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Preserve the public name during declaration emit.
interface ScenarioConfig extends InternalScenarioConfig {}

const defineConfig: (config: Parameters<typeof defineScenarioConfig>[0]) => ScenarioConfig = defineScenarioConfig

export {defineConfig}
export type {ScenarioConfig}
