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

const ToolErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
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

const ModelCallStartMessageSchema = z.object({
  type: z.literal('model.call_start'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    turnId: z.string(),
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

const AssistantToolCallDeltaMessageSchema = z.object({
  type: z.literal('assistant.tool_call_delta'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    toolCallId: z.string(),
    toolName: z.string(),
    inputDelta: z.string(),
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
    model: z.string(),
  }),
})

const ToolExecutionCompleteMessageSchema = z.object({
  type: z.literal('tool.execution_complete'),
  ...EventFieldsSchema,
  data: z.discriminatedUnion('success', [
    z.object({
      toolCallId: z.string(),
      model: z.string(),
      interactionId: z.string(),
      turnId: z.string(),
      success: z.literal(true),
      result: ToolResultSchema,
      toolTelemetry: ToolTelemetrySchema,
    }),
    z.object({
      toolCallId: z.string(),
      model: z.string(),
      interactionId: z.string(),
      turnId: z.string(),
      success: z.literal(false),
      error: ToolErrorSchema,
      toolTelemetry: ToolTelemetrySchema,
    }),
  ]),
})

const AssistantTurnEndMessageSchema = z.object({
  type: z.literal('assistant.turn_end'),
  ...EventFieldsSchema,
  data: z.object({
    turnId: z.string(),
  }),
})

const AssistantIdleMessageSchema = z.object({
  type: z.literal('assistant.idle'),
  ...EphemeralEventFieldsSchema,
  data: z.object({}),
})

const SessionUsageCheckpointMessageSchema = z.object({
  type: z.literal('session.usage_checkpoint'),
  ...EventFieldsSchema,
  data: z.object({
    totalNanoAiu: z.number(),
    totalPremiumRequests: z.number(),
    modelCacheState: z.array(
      z.object({
        modelId: z.string(),
        cacheExpiresAt: z.string(),
        cacheTtlSeconds: z.number(),
      }),
    ),
  }),
})

const SessionInfoMessageSchema = z.object({
  type: z.literal('session.info'),
  ...EphemeralEventFieldsSchema,
  data: z.object({
    infoType: z.string(),
    message: z.string(),
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

const KnownMessageSchema = z.discriminatedUnion('type', [
  SessionMcpServerStatusChangedMessageSchema,
  SessionMcpServersLoadedMessageSchema,
  SessionSkillsLoadedMessageSchema,
  SessionToolsUpdatedMessageSchema,
  ModelCallStartMessageSchema,
  UserMessageSchema,
  AssistantTurnStartMessageSchema,
  AssistantMessageStartMessageSchema,
  AssistantMessageDeltaMessageSchema,
  AssistantMessageSchema,
  AssistantReasoningMessageSchema,
  AssistantReasoningDeltaMessageSchema,
  AssistantToolCallDeltaMessageSchema,
  ToolExecutionStartMessageSchema,
  ToolExecutionCompleteMessageSchema,
  AssistantTurnEndMessageSchema,
  AssistantIdleMessageSchema,
  SessionUsageCheckpointMessageSchema,
  SessionInfoMessageSchema,
  SessionBackgroundTasksChangedMessageSchema,
  ToolExecutionPartialResultMessageSchema,
  SessionTaskCompleteMessageSchema,
  ResultMessageSchema,
])

const KnownMessageTypes = new Set([
  'session.mcp_server_status_changed',
  'session.mcp_servers_loaded',
  'session.skills_loaded',
  'session.tools_updated',
  'model.call_start',
  'user.message',
  'assistant.turn_start',
  'assistant.message_start',
  'assistant.message_delta',
  'assistant.message',
  'assistant.reasoning',
  'assistant.reasoning_delta',
  'assistant.tool_call_delta',
  'tool.execution_start',
  'tool.execution_complete',
  'assistant.turn_end',
  'assistant.idle',
  'session.usage_checkpoint',
  'session.info',
  'session.background_tasks_changed',
  'tool.execution_partial_result',
  'session.task_complete',
  'result',
])

declare const unknownMessageType: unique symbol
type UnknownMessageType = string & {readonly [unknownMessageType]: true}

const UnknownMessageSchema = z.looseObject({
  type: z.custom<UnknownMessageType, string>(
    type => typeof type === 'string' && !KnownMessageTypes.has(type),
    'Expected an unknown message type',
  ),
})

const MessageSchema = z.union([KnownMessageSchema, UnknownMessageSchema])

type KnownMessage = z.infer<typeof KnownMessageSchema>
type UnknownMessage = z.infer<typeof UnknownMessageSchema>
type Message = z.infer<typeof MessageSchema>

function isMessageType<T extends KnownMessage['type']>(
  message: Message,
  type: T,
): message is Extract<KnownMessage, {type: T}> {
  return message.type === type
}

function parseMessage(message: unknown) {
  return MessageSchema.parse(message, {reportInput: true})
}

export {
  MessageSchema,
  ResultMessageSchema,
  SessionTaskCompleteMessageSchema,
  ToolExecutionCompleteMessageSchema,
  ToolExecutionPartialResultMessageSchema,
  ToolExecutionStartMessageSchema,
  UnknownMessageSchema,
  isMessageType,
  parseMessage,
}
export type {KnownMessage, Message, UnknownMessage, UnknownMessageType}
