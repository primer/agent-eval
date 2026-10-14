import path from 'node:path'
import * as z from 'zod/mini'
import {SandboxSchema} from './sandbox'
import type {Host} from './host'
import type {Logger} from './logger'
import {isPathInside} from './path'

const AnnotationSchema = z.object({
  context: z.optional(z.string()),
  message: z.string(),
  snippet: z.optional(z.string()),
})

const MeasurementSchema = z.object({
  type: z.literal('measurement'),
  value: z.number(),
  annotations: z.optional(z.array(AnnotationSchema)),
})

const OutcomeSchema = z.object({
  type: z.literal('outcome'),
  id: z.optional(z.string()),
  status: z.enum(['passed', 'failed', 'skipped']),
  annotations: z.optional(z.array(AnnotationSchema)),
})

const ErrorSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  // annotations: z._default(z.array(AnnotationSchema), []),
})

const CheckRunResultSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('measurements'),
    unit: z.optional(z.string()),
    direction: z.optional(z.enum(['higher-is-better', 'lower-is-better'])),
    id: z.optional(z.string()),
    measurements: z.array(z.union([MeasurementSchema, ErrorSchema])),
  }),
  z.object({
    type: z.literal('outcomes'),
    id: z.optional(z.string()),
    outcomes: z.array(z.union([OutcomeSchema, ErrorSchema])),
  }),
])

type CheckRunResult = z.infer<typeof CheckRunResultSchema>

const CheckRunReturnSchema = z.array(CheckRunResultSchema)

const CheckRunInputSchema = z.tuple([
  z.object({
    logger: z.custom<Logger>(),
    sandbox: SandboxSchema,
  }),
])

type CheckRun = (...args: z.infer<typeof CheckRunInputSchema>) => Promise<z.infer<typeof CheckRunReturnSchema>>

const CheckRunSchema: z.ZodMiniType<
  CheckRun,
  (
    ...args: z.input<typeof CheckRunInputSchema>
  ) => z.input<typeof CheckRunReturnSchema> | Promise<z.input<typeof CheckRunReturnSchema>>
> = z.function({
  input: CheckRunInputSchema,
  output: z.promise(CheckRunReturnSchema),
})

const CheckConfigRunResultSchema = z.union([
  z.object({
    measurements: z.array(z.union([MeasurementSchema, ErrorSchema])),
    outcomes: z.optional(z.never()),
    unit: z.optional(z.string()),
    direction: z.optional(z.enum(['higher-is-better', 'lower-is-better'])),
    id: z.optional(z.string()),
  }),
  z.object({
    outcomes: z.array(z.union([OutcomeSchema, ErrorSchema])),
    measurements: z.optional(z.never()),
    id: z.optional(z.string()),
  }),
])

const CheckConfigRunReturnSchema = z.promise(
  z.union([
    CheckConfigRunResultSchema,
    z.array(
      z.intersection(
        CheckConfigRunResultSchema,
        z.object({
          id: z.string(),
        }),
      ),
    ),
  ]),
)

type CheckConfigRun = (...args: z.infer<typeof CheckRunInputSchema>) => z.infer<typeof CheckConfigRunReturnSchema>

const CheckConfigRunSchema: z.ZodMiniType<
  CheckConfigRun,
  (...args: z.input<typeof CheckRunInputSchema>) => z.input<typeof CheckConfigRunReturnSchema>
> = z.function({
  input: CheckRunInputSchema,
  output: CheckConfigRunReturnSchema,
})

function parseCheckRunResult(result: z.infer<typeof CheckConfigRunResultSchema>): z.infer<typeof CheckRunResultSchema> {
  if (result.measurements !== undefined) {
    const {measurements, ...metadata} = result
    return {
      ...metadata,
      type: 'measurements',
      measurements,
    }
  }

  const {outcomes, ...metadata} = result
  return {
    ...metadata,
    type: 'outcomes',
    outcomes,
  }
}

const CheckConfigFilesSchema = z._default(z.array(z.string()), [])

const CheckConfigSchema = z.object({
  name: z.string(),
  description: z.optional(z.string()),
  files: CheckConfigFilesSchema,
  run: CheckConfigRunSchema,
})

type CheckConfig = z.infer<typeof CheckConfigSchema>

async function parseCheckConfig(host: Host, directory: string, json: unknown): Promise<Check> {
  const schema = z.extend(
    z.omit(CheckConfigSchema, {
      files: true,
    }),
    {
      files: z.pipe(
        CheckConfigFilesSchema,
        z.transform(async (files, ctx) => {
          return await Promise.all(
            files.map(async input => {
              const filepath = path.isAbsolute(input) ? input : path.resolve(directory, input)
              if (!host.fs.existsSync(filepath)) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file does not exist: ${input}`,
                  input,
                })
                return z.NEVER
              }

              if (!isPathInside(directory, filepath)) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must be inside the scenario directory: ${input}`,
                  input,
                })
                return z.NEVER
              }

              const stats = await host.fs.promises.lstat(filepath)
              if (stats.isSymbolicLink()) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must not be a symbolic link: ${input}`,
                  input,
                })
                return z.NEVER
              }

              const realDirectory = await host.fs.promises.realpath(directory)
              const realFilepath = await host.fs.promises.realpath(filepath)
              if (!isPathInside(realDirectory, realFilepath)) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must be inside the scenario directory: ${input}`,
                  input,
                })
                return z.NEVER
              }

              if (realFilepath === realDirectory) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must not be the scenario directory: ${input}`,
                  input,
                })
                return z.NEVER
              }

              if (stats.isDirectory()) {
                const symbolicLinkPath = await findSymbolicLink(host, filepath)
                if (symbolicLinkPath) {
                  ctx.issues.push({
                    code: 'custom',
                    message: `Check config file directory must not contain a symbolic link: ${path.relative(directory, symbolicLinkPath)}`,
                    input,
                  })
                  return z.NEVER
                }
              }

              const relativePath = path.posix.relative(directory, filepath)

              return {
                filepath,
                relativePath,
              }
            }),
          )
        }),
      ),
    },
  )

  const result = await schema.safeParseAsync(json)
  if (!result.success) {
    throw new Error(`Invalid check config: ${z.prettifyError(result.error)}`)
  }

  return {
    ...result.data,
    run: CheckRunSchema.parse(async (input: Parameters<CheckRun>[0]) => {
      const results = await result.data.run(input)
      const groups = Array.isArray(results) ? results : [results]
      return groups.map(group => {
        return parseCheckRunResult(group)
      })
    }),
  }
}

async function findSymbolicLink(host: Host, filepath: string): Promise<string | undefined> {
  const entries = await host.fs.promises.readdir(filepath)
  for (const entry of entries) {
    const entryPath = path.join(filepath, entry.toString())
    const stats = await host.fs.promises.lstat(entryPath)
    if (stats.isSymbolicLink()) {
      return entryPath
    }

    if (stats.isDirectory()) {
      const nestedSymbolicLinkPath = await findSymbolicLink(host, entryPath)
      if (nestedSymbolicLinkPath) {
        return nestedSymbolicLinkPath
      }
    }
  }

  return undefined
}

const CheckSchema = z.object({
  name: z.string(),
  description: z.optional(z.string()),
  files: z.array(
    z.object({
      filepath: z.string(),
      relativePath: z.string(),
    }),
  ),
  run: CheckRunSchema,
})

type Check = z.infer<typeof CheckSchema>

const CheckOutputSchema = z.object({
  check: z.omit(CheckSchema, {
    run: true,
  }),
  result: CheckRunResultSchema,
})

type CheckOutput = z.infer<typeof CheckOutputSchema>

export {CheckConfigSchema, CheckSchema, CheckRunSchema, CheckOutputSchema, parseCheckConfig, parseCheckRunResult}
export type {Check, CheckConfig, CheckRun, CheckConfigRun, CheckRunResult, CheckOutput}
