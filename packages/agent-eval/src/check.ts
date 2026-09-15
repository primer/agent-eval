import path from 'node:path'
import * as z from 'zod/mini'
import {SandboxSchema} from './sandbox'
import type {Host} from './host'
import type {logger} from './logger'

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

const CheckRunResultsSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('measurements'),
    unit: z.optional(z.string()),
    direction: z.optional(z.enum(['higher-is-better', 'lower-is-better'])),
    id: z.optional(z.string()),
    results: z.array(z.union([MeasurementSchema, ErrorSchema])),
  }),
  z.object({
    type: z.literal('outcomes'),
    id: z.optional(z.string()),
    results: z.array(z.union([OutcomeSchema, ErrorSchema])),
  }),
])

const CheckRunReturnSchema = z.union([
  CheckRunResultsSchema,
  z.array(
    z.intersection(
      CheckRunResultsSchema,
      z.object({
        id: z.string(),
      }),
    ),
  ),
])

const CheckRunSchema = z.function({
  input: [
    z.object({
      logger: z.custom<typeof logger>(),
      sandbox: SandboxSchema,
    }),
  ],
  output: z.promise(CheckRunReturnSchema),
})

type CheckRun = z.infer<typeof CheckRunSchema>

const CheckConfigFilesSchema = z._default(z.array(z.string()), [])

const CheckConfigSchema = z.object({
  name: z.string(),
  description: z.optional(z.string()),
  files: CheckConfigFilesSchema,
  run: CheckRunSchema,
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

              if (!filepath.startsWith(directory)) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must be inside the scenario directory: ${input}`,
                  input,
                })
                return z.NEVER
              }

              const stats = await host.fs.stat(filepath)
              if (stats.isSymbolicLink()) {
                ctx.issues.push({
                  code: 'custom',
                  message: `Check config file path must not be a symbolic link: ${input}`,
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

  return result.data
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

const CheckResultSchema = z.object({
  //
})

type CheckResult = z.infer<typeof CheckResultSchema>

const CheckOutputSchema = z.object({
  //
})

type CheckOutput = z.infer<typeof CheckOutputSchema>

export {CheckConfigSchema, CheckSchema, CheckResultSchema, CheckRunSchema, CheckOutputSchema, parseCheckConfig}
export type {CheckConfig, CheckResult, CheckRun, CheckOutput}
