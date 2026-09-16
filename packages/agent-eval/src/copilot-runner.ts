import * as z from 'zod/mini'

const CopilotRunnerSchema = z.enum(['copilot-cli', 'copilot-sdk'])

type CopilotRunner = z.infer<typeof CopilotRunnerSchema>

export {CopilotRunnerSchema}
export type {CopilotRunner}
