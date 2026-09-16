import path from 'node:path'
import * as z from 'zod/mini'
import {SandboxSchema} from './sandbox'
import type {Host} from './host'
import type {logger} from './logger'
import {isPathInside} from './path'

// const AnnotationSchema = z.object({
//   context: z.optional(z.string()),
//   message: z.string(),
//   snippet: z.optional(z.string()),
// })

const MeasurementSchema = z.object({
  type: z.literal('measurement'),
  value: z.number(),
  // annotations: z._default(z.array(AnnotationSchema), []),
})

const OutcomeSchema = z.object({
  type: z.literal('outcome'),
  id: z.optional(z.string()),
  status: z.enum(['passed', 'failed', 'skipped']),
  // annotations: z._default(z.array(AnnotationSchema), []),
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
    logger: z.custom<typeof logger>(),
    sandbox: SandboxSchema,
  }),
])

const CheckRunSchema = z.function({
  input: CheckRunInputSchema,
  output: z.promise(CheckRunReturnSchema),
})

type CheckRun = z.infer<typeof CheckRunSchema>

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

const CheckConfigRunSchema = z.function({
  input: CheckRunInputSchema,
  output: z.promise(
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
  ),
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
              if (!host.existsSync(filepath)) {
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

              const stats = await host.fs.lstat(filepath)
              if (stats.isSymbolicLink()) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must not be a symbolic link: ${input}`,
                  input,
                })
                return z.NEVER
              }

              const realDirectory = await host.fs.realpath(directory)
              const realFilepath = await host.fs.realpath(filepath)
              if (!isPathInside(realDirectory, realFilepath)) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must be inside the scenario directory: ${input}`,
                  input,
                })
                return z.NEVER
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
export type {Check, CheckConfig, CheckRun, CheckRunResult, CheckOutput}
