import {getEnvironment} from '../env'
import type {Environment} from '../env'
import type {FeatureFlag} from './flags'

export function enabled(flag: FeatureFlag, env: Environment = getEnvironment()): boolean {
  return env.flags.get(flag) === true
}
