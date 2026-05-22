import * as z from 'zod/mini'

const ToolArgumentsSchema = z.union([z.string(), z.record(z.string(), z.unknown())])

const ToolRequestSchema = z.object({
  toolCallId: z.string(),
  name: z.string(),
  arguments: ToolArgumentsSchema,
  type: z.enum(['function', 'custom']),
  intentionSummary: z.optional(z.string()),
  toolTitle: z.optional(z.string()),
})

const ToolResultSchema = z.object({
  content: z.string(),
  detailedContent: z.string(),
})

const ToolTelemetrySchema = z.object({
  properties: z.optional(z.record(z.string(), z.string())),
  metrics: z.optional(z.record(z.string(), z.number())),
  restrictedProperties: z.optional(z.record(z.string(), z.string())),
})

const ServerSchema = z.object({
  name: z.string(),
  status: z.string(),
  source: z.optional(z.string()),
})

const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.string(),
  userInvocable: z.boolean(),
  enabled: z.boolean(),
  path: z.string(),
})

const EventFieldsSchema = {
  id: z.string(),
  timestamp: z.string(),
  parentId: z.string(),
}

const EphemeralEventFieldsSchema = {
  ...EventFieldsSchema,
  ephemeral: z.boolean(),
}

const SessionMcpServerStatusChangedMessageSchema = z.object({
  type: z.literal('session.mcp_server_status_changed'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    serverName: z.string(),
    status: z.string(),
  }),
})

const SessionMcpServersLoadedMessageSchema = z.object({
  type: z.literal('session.mcp_servers_loaded'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    servers: z.array(ServerSchema),
  }),
})

const SessionSkillsLoadedMessageSchema = z.object({
  type: z.literal('session.skills_loaded'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    skills: z.array(SkillSchema),
  }),
})

const SessionToolsUpdatedMessageSchema = z.object({
  type: z.literal('session.tools_updated'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    model: z.string(),
  }),
})

const UserMessageSchema = z.object({
  type: z.literal('user.message'),
  ...EventFieldsSchema,
  data: z.object({
    content: z.string(),
    transformedContent: z.string(),
    attachments: z.array(z.unknown()),
    supportedNativeDocumentMimeTypes: z.array(z.string()),
    agentMode: z.string(),
    interactionId: z.string(),
    parentAgentTaskId: z.string(),
  }),
})

const AssistantTurnStartMessageSchema = z.object({
  type: z.literal('assistant.turn_start'),
  ...EventFieldsSchema,
  data: z.object({
    turnId: z.string(),
    interactionId: z.string(),
  }),
})

const AssistantMessageStartMessageSchema = z.object({
  type: z.literal('assistant.message_start'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    messageId: z.string(),
    phase: z.optional(z.string()),
  }),
})

const AssistantMessageDeltaMessageSchema = z.object({
  type: z.literal('assistant.message_delta'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    messageId: z.string(),
    deltaContent: z.string(),
  }),
})

const AssistantMessageSchema = z.object({
  type: z.literal('assistant.message'),
  ...EventFieldsSchema,
  data: z.object({
    messageId: z.string(),
    content: z.string(),
    toolRequests: z.array(ToolRequestSchema),
    interactionId: z.string(),
    turnId: z.string(),
    reasoningOpaque: z.optional(z.string()),
    encryptedContent: z.optional(z.string()),
    phase: z.optional(z.string()),
    outputTokens: z.number(),
    requestId: z.string(),
  }),
})

const AssistantReasoningMessageSchema = z.object({
  type: z.literal('assistant.reasoning'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    reasoningId: z.string(),
    content: z.string(),
  }),
})

const AssistantReasoningDeltaMessageSchema = z.object({
  type: z.literal('assistant.reasoning_delta'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    reasoningId: z.string(),
    deltaContent: z.string(),
  }),
})

const ToolExecutionStartMessageSchema = z.object({
  type: z.literal('tool.execution_start'),
  ...EventFieldsSchema,
  data: z.object({
    toolCallId: z.string(),
    toolName: z.string(),
    arguments: ToolArgumentsSchema,
    turnId: z.string(),
  }),
})

const ToolExecutionCompleteMessageSchema = z.object({
  type: z.literal('tool.execution_complete'),
  ...EventFieldsSchema,
  data: z.object({
    toolCallId: z.string(),
    model: z.string(),
    interactionId: z.string(),
    turnId: z.string(),
    success: z.boolean(),
    result: ToolResultSchema,
    toolTelemetry: ToolTelemetrySchema,
  }),
})

const AssistantTurnEndMessageSchema = z.object({
  type: z.literal('assistant.turn_end'),
  ...EventFieldsSchema,
  data: z.object({
    turnId: z.string(),
  }),
})

const SessionBackgroundTasksChangedMessageSchema = z.object({
  type: z.literal('session.background_tasks_changed'),
  ...EphemeralEventFieldsSchema,
  data: z.record(z.string(), z.unknown()),
})

const ToolExecutionPartialResultMessageSchema = z.object({
  type: z.literal('tool.execution_partial_result'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    toolCallId: z.string(),
    partialOutput: z.string(),
  }),
})

const SessionTaskCompleteMessageSchema = z.object({
  type: z.literal('session.task_complete'),
  ...EventFieldsSchema,
  data: z.object({
    summary: z.string(),
    success: z.boolean(),
  }),
})

const ResultMessageSchema = z.object({
  type: z.literal('result'),
  timestamp: z.string(),
  sessionId: z.string(),
  exitCode: z.number(),
  usage: z.object({
    premiumRequests: z.number(),
    totalApiDurationMs: z.number(),
    sessionDurationMs: z.number(),
    codeChanges: z.object({
      linesAdded: z.number(),
      linesRemoved: z.number(),
      filesModified: z.array(z.string()),
    }),
  }),
})

const MessageSchema = z.discriminatedUnion('type', [
  SessionMcpServerStatusChangedMessageSchema,
  SessionMcpServersLoadedMessageSchema,
  SessionSkillsLoadedMessageSchema,
  SessionToolsUpdatedMessageSchema,
  UserMessageSchema,
  AssistantTurnStartMessageSchema,
  AssistantMessageStartMessageSchema,
  AssistantMessageDeltaMessageSchema,
  AssistantMessageSchema,
  AssistantReasoningMessageSchema,
  AssistantReasoningDeltaMessageSchema,
  ToolExecutionStartMessageSchema,
  ToolExecutionCompleteMessageSchema,
  AssistantTurnEndMessageSchema,
  SessionBackgroundTasksChangedMessageSchema,
  ToolExecutionPartialResultMessageSchema,
  SessionTaskCompleteMessageSchema,
  ResultMessageSchema,
])

type Message = z.infer<typeof MessageSchema>

function parseMessage(message: unknown) {
  return MessageSchema.safeParse(message)
}

export {
  MessageSchema,
  ResultMessageSchema,
  SessionTaskCompleteMessageSchema,
  ToolExecutionCompleteMessageSchema,
  ToolExecutionPartialResultMessageSchema,
  ToolExecutionStartMessageSchema,
  parseMessage,
}
export type {Message}
