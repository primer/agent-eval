import * as z from 'zod/mini'
import {CheckConfigSchema} from '../check'
import {JudgeConfigSchema} from '../judge'

const PromptConfigSchema = z.object({
  prompt: z.string(),
  checks: z._default(z.array(CheckConfigSchema), []),
  judges: z._default(z.array(JudgeConfigSchema), []),
})

const PromptItemSchema = z.union([z.string(), PromptConfigSchema])

const PromptSchema = z.pipe(
  z.union([PromptItemSchema, z.array(PromptItemSchema).check(z.minLength(1))]),
  z.transform(prompt => {
    return Array.isArray(prompt) ? prompt : [prompt]
  }),
)

export {PromptConfigSchema, PromptSchema}
