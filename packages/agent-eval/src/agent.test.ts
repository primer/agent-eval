import {describe, expect, test} from 'vitest'
import {AgentSessionSchema, getAgentSession} from './agent'
import {parseMessage} from './copilot-cli'

const result = {
  type: 'result',
  timestamp: '2026-09-16T00:00:00.000Z',
  sessionId: 'session',
  exitCode: 0,
  usage: {
    premiumRequests: 1,
    totalApiDurationMs: 123,
    sessionDurationMs: 456,
    codeChanges: {linesAdded: 0, linesRemoved: 0, filesModified: []},
  },
}

function usageEvent(totalNanoAiu: number, type = 'session.usage_checkpoint', agentId?: string) {
  return {
    type,
    id: 'usage',
    timestamp: result.timestamp,
    parentId: '',
    ...(agentId === undefined ? {} : {agentId}),
    data: {totalNanoAiu},
  }
}

describe(getAgentSession, () => {
  test.each([0, 1, 2_839_800_000])('converts %s nano-AIU to AI credits', totalNanoAiu => {
    const session = getAgentSession([usageEvent(totalNanoAiu), result].map(parseMessage))

    expect(session.aiCredits).toBe(totalNanoAiu / 1_000_000_000)
    expect(AgentSessionSchema.parse(session).aiCredits).toBe(session.aiCredits)
    expect(session).toMatchObject({
      premiumRequests: 1,
      totalApiDurationMs: 123,
      sessionDurationMs: 456,
      turns: 0,
      outputTokens: 0,
      tools: {},
    })
  })

  test('uses the latest cumulative checkpoint rather than adding checkpoints or subagent totals', () => {
    const messages = [
      usageEvent(1_000_000_000),
      usageEvent(2_839_800_000),
      usageEvent(1_500_000_000, 'session.usage_checkpoint', 'subagent'),
      result,
    ].map(parseMessage)

    expect(getAgentSession(messages).aiCredits).toBe(2.8398)
  })

  test('uses the final shutdown total without double-counting subagents', () => {
    const messages = [
      usageEvent(1_000_000_000),
      usageEvent(3_000_000_000, 'session.shutdown'),
      usageEvent(2_000_000_000, 'session.shutdown', 'subagent'),
      result,
    ].map(parseMessage)

    expect(getAgentSession(messages).aiCredits).toBe(3)
  })

  test('preserves checkpoint credits when shutdown omits usage', () => {
    const messages = [usageEvent(1_000_000_000), {...usageEvent(0, 'session.shutdown'), data: {}}, result].map(
      parseMessage,
    )

    expect(getAgentSession(messages).aiCredits).toBe(1)
  })

  test('distinguishes unavailable credits from zero and accepts older session results', () => {
    const session = getAgentSession([parseMessage(result)])

    expect(session).not.toHaveProperty('aiCredits')
    expect(AgentSessionSchema.parse(session)).toEqual(session)
  })

  test('does not mistake subagent-only usage for a session total', () => {
    const messages = [usageEvent(1_000_000_000, 'session.usage_checkpoint', 'subagent'), result].map(parseMessage)

    expect(getAgentSession(messages)).not.toHaveProperty('aiCredits')
  })

  test('still requires a result message', () => {
    expect(() => getAgentSession([parseMessage(usageEvent(1_000_000_000))])).toThrow(
      'No result message found in copilot output',
    )
  })
})
