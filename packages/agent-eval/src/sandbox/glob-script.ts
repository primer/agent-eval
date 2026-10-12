import {glob} from 'glob'
import * as z from 'zod/mini'

const RequestSchema = z.strictObject({
  pattern: z.union([z.string(), z.array(z.string())]),
  options: z.strictObject({
    absolute: z.optional(z.boolean()),
    cwd: z.string(),
    dot: z.optional(z.boolean()),
    dotRelative: z.optional(z.boolean()),
    follow: z.optional(z.boolean()),
    ignore: z.optional(z.union([z.string(), z.array(z.string())])),
    mark: z.optional(z.boolean()),
    matchBase: z.optional(z.boolean()),
    maxDepth: z.optional(z.number()),
    nobrace: z.optional(z.boolean()),
    nocase: z.optional(z.boolean()),
    nodir: z.optional(z.boolean()),
    noext: z.optional(z.boolean()),
    noglobstar: z.optional(z.boolean()),
    posix: z.optional(z.boolean()),
    realpath: z.optional(z.boolean()),
    root: z.optional(z.string()),
    stat: z.optional(z.boolean()),
  }),
})

function parseRequest(input: unknown) {
  return RequestSchema.parse(input)
}

const input = process.argv[2]
if (input === undefined) {
  throw new Error('A glob request is required')
}
const request = parseRequest(JSON.parse(input))
const matches = await glob(request.pattern, {
  nocase: false,
  ...request.options,
})
console.log(JSON.stringify(matches))
