import * as z from 'zod/mini'

const PromptSchema = z.pipe(
  z.union([z.string(), z.array(z.string()).check(z.minLength(1))]),
  z.transform(prompt => {
    return typeof prompt === 'string' ? [prompt] : prompt
  }),
)

export {PromptSchema}
