import * as z from 'zod/mini'

const FeatureFlagSchema = z.enum(['ui-command'])

type FeatureFlag = z.infer<typeof FeatureFlagSchema>

const DefaultFeatureFlags: Map<FeatureFlag, boolean> = new Map([['ui-command', false]])

// Support either "flag-name" or "!flag-name" to indicate enabled or disabled
const FeatureFlagConfigSchema = z.pipe(
  z.pipe(
    z.string(),
    z.transform(value => {
      if (value.startsWith('!')) {
        return {
          name: value.slice(1),
          enabled: false,
        }
      } else {
        return {
          name: value,
          enabled: true,
        }
      }
    }),
  ),
  z.object({
    name: FeatureFlagSchema,
    enabled: z.boolean(),
  }),
)

type FeatureFlagConfig = z.infer<typeof FeatureFlagConfigSchema>

// Transform a comma-separated string, such as "flag1,!flag2,flag3", into an array of FeatureFlagConfig objects
const FeatureFlagsConfigSchema = z.pipe(
  z.pipe(
    z.string(),
    z.transform(value => {
      return value
        .split(',')
        .map(part => {
          return part.trim()
        })
        .filter(part => {
          return part.length > 0
        })
    }),
  ),
  z.array(FeatureFlagConfigSchema),
)

type FeatureFlagsConfig = z.infer<typeof FeatureFlagsConfigSchema>

export {DefaultFeatureFlags, FeatureFlagSchema, FeatureFlagConfigSchema, FeatureFlagsConfigSchema}
export type {FeatureFlag, FeatureFlagConfig, FeatureFlagsConfig}
