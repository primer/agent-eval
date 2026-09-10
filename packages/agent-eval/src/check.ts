import * as z from 'zod/mini'
import {SandboxSchema} from './sandbox'

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
      sandbox: SandboxSchema,
    }),
  ],
  output: z.promise(CheckRunReturnSchema),
})

type CheckRun = z.infer<typeof CheckRunSchema>

const CheckConfigSchema = z.object({
  name: z.string(),
  description: z.optional(z.string()),
  files: z._default(z.array(z.string()), []),
  run: CheckRunSchema,
})

type CheckConfig = z.infer<typeof CheckConfigSchema>

const CheckResultSchema = z.object({
  //
})

type CheckResult = z.infer<typeof CheckResultSchema>

const CheckOutputSchema = z.object({
  //
})

type CheckOutput = z.infer<typeof CheckOutputSchema>

export {CheckConfigSchema, CheckResultSchema, CheckRunSchema, CheckOutputSchema}
export type {CheckConfig, CheckResult, CheckRun, CheckOutput}
