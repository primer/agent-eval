import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import {COPILOT_DIR} from './sandbox/constants'

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

function getCopilotTelemetryEnv(): Record<string, string> {
  return {
    COPILOT_OTEL_ENABLED: 'true',
    COPILOT_OTEL_EXPORTER_TYPE: 'file',
    COPILOT_OTEL_FILE_EXPORTER_PATH: `${COPILOT_DIR}/otel-${randomUUID()}.jsonl`,
    OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'false',
  }
}

export {CopilotRunnerSchema, CopilotRunnerConfigSchema, getCopilotTelemetryEnv}
export type {CopilotRunner, CopilotRunnerConfig}
