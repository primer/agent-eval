import path from 'node:path'
import * as z from 'zod/mini'
import {CheckConfigSchema, type CheckConfig} from '../check'
import {JudgeConfigSchema, type JudgeConfig} from '../judge'
import type {Host} from '../host'
import {TreatmentSetupSchema, type TreatmentSetup} from '../treatment'

type ScenarioConfig = {
  description?: string
  prompt: string
  tags: Array<string>
  checks: Array<CheckConfig>
  judges: Array<JudgeConfig>
  image?: DockerImageConfig
  setup?: TreatmentSetup
}

type DockerImageConfig =
  | {
      type: 'Reference'
      name: string
    }
  | {
      type: 'Build'
      dockerfile: string
      context: string
      // TODO: ignore, args
    }

const DefaultDockerImageConfig = {
  type: 'Default',
} as const

const DockerImageConfigInputSchema = z.pipe(
  z.optional(
    z.union([
      z.string(),
      z.object({
        name: z.string(),
      }),
      z.object({
        dockerfile: z.string(),
        context: z._default(z.string(), '.'),
      }),
    ]),
  ),
  z.transform(image => {
    if (image === undefined) {
      return image
    }

    if (typeof image === 'string') {
      return {
        type: 'Reference',
        name: image,
        context: '.',
      } as const
    }

    if ('name' in image) {
      return {
        type: 'Reference',
        name: image.name,
      } as const
    }

    return {
      type: 'Build',
      dockerfile: image.dockerfile,
      context: image.context,
    } as const
  }),
)

const ScenarioConfigSchema = z.object({
  description: z.optional(z.string()),
  prompt: z.string(),
  tags: z._default(z.array(z.string()), []),
  checks: z._default(z.array(CheckConfigSchema), []),
  judges: z._default(z.array(JudgeConfigSchema), []),
  image: DockerImageConfigInputSchema,
  setup: z.optional(TreatmentSetupSchema),
}) satisfies z.ZodMiniType<ScenarioConfig>

function parseScenarioConfig(host: Host, scenarioDirectory: string, input: unknown): ScenarioConfig {
  const schema = z.extend(ScenarioConfigSchema, {
    image: z.pipe(
      DockerImageConfigInputSchema,
      z.transform((image, ctx) => {
        if (image === undefined) {
          return image
        }

        if (image.type === 'Reference') {
          return image
        }

        const dockerfile = path.isAbsolute(image.dockerfile)
          ? image.dockerfile
          : path.resolve(scenarioDirectory, image.dockerfile)
        if (!host.existsSync(dockerfile)) {
          ctx.issues.push({
            code: 'custom',
            message: `Dockerfile does not exist: ${image.dockerfile}`,
            input: image.dockerfile,
          })
          return z.NEVER
        }

        const context = path.isAbsolute(image.context) ? image.context : path.resolve(scenarioDirectory, image.context)
        if (!host.existsSync(context)) {
          ctx.issues.push({
            code: 'custom',
            message: `Docker context directory does not exist: ${image.context}`,
            input: image.context,
          })
          return z.NEVER
        }

        return {
          type: 'Build',
          dockerfile,
          context,
        } as const
      }),
    ),
  })
  return schema.parse(input)
}

const DockerImageConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Reference'),
    name: z.string(),
  }),
  z.object({
    type: z.literal('Build'),
    dockerfile: z.string(),
    context: z.string(),
  }),
]) satisfies z.ZodMiniType<DockerImageConfig>

type ScenarioConfigModule = {
  default?: unknown
}

function defineConfig(config: z.input<typeof ScenarioConfigSchema>): ScenarioConfig {
  return ScenarioConfigSchema.parse(config)
}

export {ScenarioConfigSchema, defineConfig, DefaultDockerImageConfig, DockerImageConfigSchema, parseScenarioConfig}
export type {ScenarioConfig, ScenarioConfigModule, DockerImageConfig}
