import * as z from 'zod/mini'
import {isMessageType, MessageSchema, type Message} from './copilot-cli'

const AgentSessionSchema = z.object({
  turns: z.number(),
  outputTokens: z.number(),
  premiumRequests: z.number(),
  aiCredits: z.optional(z.number()),
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
  let usageOutputTokens: number | undefined
  let totalNanoAiu: number | undefined

  for (const message of messages) {
    if (
      (isMessageType(message, 'session.usage_checkpoint') || isMessageType(message, 'session.shutdown')) &&
      !message.agentId &&
      message.data.totalNanoAiu !== undefined
    ) {
      // These totals already include subagents and replace earlier checkpoints.
      totalNanoAiu = message.data.totalNanoAiu
    }

    if (isMessageType(message, 'assistant.turn_start')) {
      turns.add(message.data.turnId)
    }

    if (isMessageType(message, 'assistant.message')) {
      assistantOutputTokens += message.data.outputTokens ?? 0
    }

    if (
      isMessageType(message, 'model.message') &&
      message.data.message.role === 'assistant' &&
      message.data.message.outputTokens !== undefined
    ) {
      hasModelOutput = true
      modelOutputTokens += message.data.message.outputTokens
    }

    if (isMessageType(message, 'assistant.usage') && message.data.outputTokens !== undefined) {
      usageOutputTokens = (usageOutputTokens ?? 0) + message.data.outputTokens
    }

    if (isMessageType(message, 'tool.execution_start')) {
      const toolName = message.data.toolName
      toolCalls.set(toolName, (toolCalls.get(toolName) ?? 0) + 1)
    }
  }

  const results = messages.filter(message => isMessageType(message, 'result'))
  if (results.length === 0) {
    throw new Error('No result message found in copilot output')
  }

  return {
    messages,
    outputTokens: results.every(result => result.usage.outputTokens !== undefined)
      ? results.reduce((total, result) => total + result.usage.outputTokens!, 0)
      : (usageOutputTokens ?? (hasModelOutput ? modelOutputTokens : assistantOutputTokens)),
    premiumRequests: results.reduce((total, result) => total + result.usage.premiumRequests, 0),
    ...(totalNanoAiu === undefined ? {} : {aiCredits: totalNanoAiu / 1_000_000_000}),
    sessionDurationMs: results.reduce((total, result) => total + result.usage.sessionDurationMs, 0),
    tools: Object.fromEntries(toolCalls),
    totalApiDurationMs: results.reduce((total, result) => total + result.usage.totalApiDurationMs, 0),
    turns: turns.size,
  }
}

export {AgentSessionSchema, getAgentSession}
export type {AgentSession}
