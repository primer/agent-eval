import path from 'node:path'
import * as z from 'zod/mini'
import type {Host} from '../host'
import {validateDockerBuild} from '../sandbox/build'

const NonEmptyStringSchema = z.string().check(
  z.refine(value => {
    return value.trim().length > 0
  }, 'Expected a non-empty string'),
)

const ScenarioWorkspaceSchema = z.union([
  z.object({
    source: z.literal('image'),
    image: NonEmptyStringSchema,
    dockerfile: z.optional(z.never()),
    context: z.optional(z.never()),
  }),
  z.object({
    source: z.literal('image'),
    image: z.optional(z.never()),
    dockerfile: NonEmptyStringSchema,
    context: z.optional(NonEmptyStringSchema),
  }),
])

type ScenarioWorkspace = z.infer<typeof ScenarioWorkspaceSchema>

async function validateWorkspace(host: Host, directory: string, workspace: ScenarioWorkspace): Promise<void> {
  if (workspace.dockerfile === undefined) {
    return
  }

  await validateDockerBuild(host, {
    context: path.resolve(directory, workspace.context ?? '.'),
    dockerfile: path.resolve(directory, workspace.dockerfile),
  })
}

export {ScenarioWorkspaceSchema, validateWorkspace}
export type {ScenarioWorkspace}
