import * as z from 'zod/mini'

const CopilotRunnerSchema = z.enum(['copilot-cli', 'copilot-sdk'])

type CopilotRunner = z.infer<typeof CopilotRunnerSchema>

const CopilotRunnerConfigSchema = z._default(
  z.array(CopilotRunnerSchema).check(
    z.minLength(1),
    z.refine(
      values => {
        const runners = new Set()
        for (const value of values) {
          if (runners.has(value)) {
            return false
          }
          runners.add(value)
        }

        return true
      },
      {
        message: 'Runner names must be unique',
      },
    ),
  ),
  ['copilot-cli'],
)

type CopilotRunnerConfig = z.infer<typeof CopilotRunnerConfigSchema>

export {CopilotRunnerSchema, CopilotRunnerConfigSchema}
export type {CopilotRunner, CopilotRunnerConfig}
