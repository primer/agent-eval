const DEFAULT_PLAN_PATH = 'plan.json'

const optionalPathDefaults = new Map<string, string>([
  ['--plan', DEFAULT_PLAN_PATH],
  ['--from-plan', DEFAULT_PLAN_PATH],
  ['--merge-shards', ''],
])

type CliModeOptions = {
  benchmark?: string
  experiment?: string
  plan?: string
  'from-plan'?: string
  'merge-shards'?: string
  shard?: string
}

type CliMode =
  | {
      kind: 'none'
    }
  | {
      kind: 'benchmark'
      id: string
    }
  | {
      kind: 'experiment'
      id: string
    }
  | {
      kind: 'create-plan'
      sourceKind: 'benchmark' | 'experiment'
      sourceId: string
      path: string
    }
  | {
      kind: 'from-plan'
      path: string
      shard?: string
    }
  | {
      kind: 'merge-shards'
      directory?: string
    }

function normalizeOptionalPathArguments(args: Array<string>): Array<string> {
  const normalized: Array<string> = []

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    const defaultValue = optionalPathDefaults.get(argument)
    if (defaultValue === undefined) {
      normalized.push(argument)
      continue
    }

    const next = args[index + 1]
    if (next === undefined || next.startsWith('-')) {
      normalized.push(`${argument}=${defaultValue}`)
      continue
    }

    normalized.push(argument, next)
    index += 1
  }

  return normalized
}

function getCliMode(options: CliModeOptions): CliMode {
  if (options.benchmark && options.experiment) {
    throw new Error('--benchmark and --experiment cannot be combined')
  }

  if (options['from-plan']) {
    if (
      options.benchmark ||
      options.experiment ||
      options.plan !== undefined ||
      options['merge-shards'] !== undefined
    ) {
      throw new Error('--from-plan cannot be combined with --benchmark, --experiment, --plan, or --merge-shards')
    }

    return {
      kind: 'from-plan',
      path: options['from-plan'],
      shard: options.shard,
    }
  }

  if (options['merge-shards'] !== undefined) {
    if (options.benchmark || options.experiment || options.plan !== undefined) {
      throw new Error('--merge-shards cannot be combined with --benchmark, --experiment, or --plan')
    }

    if (options.shard) {
      throw new Error('--shard is only valid with --from-plan')
    }

    return {
      kind: 'merge-shards',
      directory: options['merge-shards'] || undefined,
    }
  }

  if (options.shard) {
    throw new Error('--shard is only valid with --from-plan')
  }

  if (options.plan !== undefined) {
    if (!options.benchmark && !options.experiment) {
      throw new Error('--plan requires --benchmark or --experiment')
    }

    const sourceId = options.benchmark ?? options.experiment
    if (!sourceId) {
      throw new Error('--plan requires --benchmark or --experiment')
    }

    return {
      kind: 'create-plan',
      sourceKind: options.benchmark ? 'benchmark' : 'experiment',
      sourceId,
      path: options.plan,
    }
  }

  if (options.benchmark) {
    return {
      kind: 'benchmark',
      id: options.benchmark,
    }
  }

  if (options.experiment) {
    return {
      kind: 'experiment',
      id: options.experiment,
    }
  }

  return {
    kind: 'none',
  }
}

export {DEFAULT_PLAN_PATH, getCliMode, normalizeOptionalPathArguments}
export type {CliMode, CliModeOptions}
