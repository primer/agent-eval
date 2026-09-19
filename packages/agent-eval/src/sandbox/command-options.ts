import * as z from 'zod/mini'

const CommandOptionsSchema = z.object({
  timeoutMs: z._default(z.number().check(z.int(), z.positive(), z.maximum(2_147_483_647)), 60 * 60 * 1000),
  signal: z.optional(z.instanceof(AbortSignal)),
})

function parseCommandOptions(input: unknown) {
  return CommandOptionsSchema.parse(input)
}

export {parseCommandOptions}
