import {isDeepStrictEqual} from 'node:util'
import * as z from 'zod/mini'

function checkUniqueTrialIds(type: 'benchmark' | 'experiment') {
  return z.check<Array<{id: string}>>(ctx => {
    const ids = new Set<string>()
    for (const [index, trial] of ctx.value.entries()) {
      if (ids.has(trial.id)) {
        ctx.issues.push({
          code: 'custom',
          message: `Duplicate trial ID in ${type} plan: ${trial.id}`,
          path: [index, 'id'],
          input: trial.id,
        })
      }
      ids.add(trial.id)
    }
  })
}

function checkMetadataIds(type: 'capability' | 'scenario' | 'treatment') {
  return z.check<Record<string, {id: string}>>(ctx => {
    for (const [key, metadata] of Object.entries(ctx.value)) {
      if (metadata.id !== key) {
        ctx.issues.push({
          code: 'custom',
          message: `Manifest ${type} ID "${metadata.id}" does not match key "${key}"`,
          path: [key, 'id'],
          input: metadata.id,
        })
      }
    }
  })
}

type OutputFile = {
  id: string
  capabilities?: Record<string, unknown>
  scenarios: Record<string, unknown>
  treatments: Record<string, unknown>
  trials: Record<string, string>
}

function createOutputFilesSchema<T extends OutputFile>(schema: z.ZodMiniType<T>, type: 'benchmark' | 'experiment') {
  return z.array(schema).check(z.minLength(1, `Cannot merge ${type} output files: no outputs provided`), ctx => {
    const id = ctx.value[0]?.id
    const trialIds = new Set<string>()
    const metadata = {
      capabilities: new Map<string, unknown>(),
      scenarios: new Map<string, unknown>(),
      treatments: new Map<string, unknown>(),
    }
    const metadataTypes = {
      capabilities: 'capability',
      scenarios: 'scenario',
      treatments: 'treatment',
    }

    for (const [index, output] of ctx.value.entries()) {
      if (output.id !== id) {
        ctx.issues.push({
          code: 'custom',
          message: `Cannot merge ${type} output files: mismatched ${type} IDs (${id} !== ${output.id})`,
          path: [index, 'id'],
          input: output.id,
        })
      }

      for (const field of ['capabilities', 'scenarios', 'treatments'] as const) {
        const records = output[field]
        if (records === undefined) {
          continue
        }

        for (const [key, value] of Object.entries(records)) {
          const values = metadata[field]
          if (values.has(key) && !isDeepStrictEqual(values.get(key), value)) {
            ctx.issues.push({
              code: 'custom',
              message: `Cannot merge conflicting ${metadataTypes[field]} metadata for id: ${key}`,
              path: [index, field, key],
              input: value,
            })
          }
          values.set(key, value)
        }
      }

      for (const key of Object.keys(output.trials)) {
        if (trialIds.has(key)) {
          ctx.issues.push({
            code: 'custom',
            message: `Cannot merge ${type} output files: duplicate trial ID found: ${key}`,
            path: [index, 'trials', key],
            input: key,
          })
        }
        trialIds.add(key)
      }
    }
  })
}

export {checkUniqueTrialIds, checkMetadataIds, createOutputFilesSchema}
