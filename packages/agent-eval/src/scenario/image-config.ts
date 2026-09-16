import path from 'node:path'
import * as z from 'zod/mini'
import type {Host} from '../host'
import {validateDockerBuild} from '../sandbox/build'

const NonEmptyStringSchema = z.string().check(
  z.refine(value => {
    return value.trim().length > 0
  }, 'Expected a non-empty string'),
)

const ScenarioImageSchema = z.union([
  NonEmptyStringSchema,
  z.strictObject({
    dockerfile: NonEmptyStringSchema,
    context: z.optional(NonEmptyStringSchema),
  }),
])

type ScenarioImage = z.infer<typeof ScenarioImageSchema>

async function validateScenarioImage(host: Host, directory: string, image: ScenarioImage): Promise<void> {
  if (typeof image === 'string') {
    return
  }

  await validateDockerBuild(host, {
    context: path.resolve(directory, image.context ?? '.'),
    dockerfile: path.resolve(directory, image.dockerfile),
  })
}

export {ScenarioImageSchema, validateScenarioImage}
export type {ScenarioImage}
