import * as z from 'zod/mini'
import {isMessageType, MessageSchema, type Message} from './copilot-cli'

const AgentSessionSchema = z.object({
  turns: z.number(),
  outputTokens: z.number(),
  premiumRequests: z.number(),
  totalApiDurationMs: z.number(),
  sessionDurationMs: z.number(),
  tools: z.record(z.string(), z.number()),
  messages: z.array(MessageSchema),
})

type AgentSession = z.infer<typeof AgentSessionSchema>

function getAgentSession(messages: Array<Message>): AgentSession {
  const turns = new Set()
  const toolCalls = new Map()
  let assistantOutputTokens = 0
  let modelOutputTokens = 0
  let hasModelOutput = false

  for (const message of messages) {
    if (isMessageType(message, 'assistant.turn_start')) {
      turns.add(message.data.turnId)
    }

    if (isMessageType(message, 'assistant.message')) {
      assistantOutputTokens += message.data.outputTokens ?? 0
    }

    if (isMessageType(message, 'model.message') && message.data.message.role === 'assistant') {
      hasModelOutput = true
      modelOutputTokens += message.data.message.outputTokens ?? 0
    }

    if (isMessageType(message, 'tool.execution_start')) {
      const toolName = message.data.toolName
      toolCalls.set(toolName, (toolCalls.get(toolName) ?? 0) + 1)
    }
  }

  const result = messages.find(message => isMessageType(message, 'result'))
  if (!result) {
    throw new Error('No result message found in copilot output')
  }

  return {
    messages,
    outputTokens: hasModelOutput ? modelOutputTokens : assistantOutputTokens,
    premiumRequests: result.usage.premiumRequests,
    sessionDurationMs: result.usage.sessionDurationMs,
    tools: Object.fromEntries(toolCalls),
    totalApiDurationMs: result.usage.totalApiDurationMs,
    turns: turns.size,
  }
}

export {AgentSessionSchema, getAgentSession}
export type {AgentSession}
