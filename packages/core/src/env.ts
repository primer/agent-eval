import {AsyncLocalStorage} from 'node:async_hooks'
import process from 'node:process'
import {DefaultFeatureFlags, FeatureFlagsConfigSchema} from './feature-flag/flags'
import type {FeatureFlag} from './feature-flag/flags'

const environments = new AsyncLocalStorage<Environment>()

type Environment = {
  flags: Map<FeatureFlag, boolean>
}

const {AGENT_EVAL_FEATURE_FLAGS} = process.env
const flags: Map<FeatureFlag, boolean> = new Map(DefaultFeatureFlags)

if (AGENT_EVAL_FEATURE_FLAGS && typeof AGENT_EVAL_FEATURE_FLAGS === 'string') {
  const config = FeatureFlagsConfigSchema.parse(AGENT_EVAL_FEATURE_FLAGS)

  for (const {name, enabled} of config) {
    flags.set(name, enabled)
  }
}

const DefaultEnvironment: Environment = {
  flags,
}

function getEnvironment(): Environment {
  return environments.getStore() ?? DefaultEnvironment
}

function withEnvironment<T>(env: Environment, callback: () => T): T {
  return environments.run(env, callback)
}

export {getEnvironment, withEnvironment}
export type {Environment}
