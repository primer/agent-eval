import {describe, expect, test} from 'vitest'
import {parseMessage} from './copilot-cli'

describe(parseMessage, () => {
  test.each([
    {
      type: 'session.mcp_servers_loaded',
      data: {
        servers: [
          {name: 'primer', status: 'connected'},
          {name: 'github-mcp-server', status: 'connected', source: 'builtin'},
        ],
      },
      id: '3f7b1d22-08d7-4313-885b-19403b54f071',
      timestamp: '2026-05-22T15:49:54.893Z',
      parentId: 'b8a098ff-1254-4dda-afcf-82a9dd9a4ecd',
      ephemeral: true,
    },
    {
      type: 'assistant.reasoning_delta',
      data: {
        reasoningId: '15a4b8d1-5285-4272-9d93-45d3c4a52f84',
        deltaContent: ' while keeping the other Primer components like FormControl, TextInput, Button, and Heading.',
      },
      id: 'efa6ac3a-fea4-43d7-99ed-558e3f33c3f4',
      timestamp: '2026-05-22T15:52:49.959Z',
      parentId: '97d9171f-d9f4-4ecd-b70f-22b2a331fb24',
      ephemeral: true,
    },
    {
      type: 'assistant.reasoning',
      data: {
        reasoningId: 'wUvLvUcp7ARCRrpRmqD0RkO5qQxZgdQIC5N',
        content: '',
      },
      ephemeral: true,
      id: 'efac0654-a748-4ea7-a5ed-5af27b33ee4c69',
      timestamp: '2026-07-24T15:24:00.746Z',
      parentId: '04675368-58ad-4238-8827-f340f0160a30',
    },
    {
      type: 'assistant.message_start',
      data: {
        messageId: 'fbdb0ec9-32c3-4a1a-846b-2beb84bb8ae2',
      },
      id: '23067aad-f2e9-47ed-bc07-a656c1173a97',
      timestamp: '2026-05-22T15:53:12.261Z',
      parentId: '72748568-18fb-4fed-8c93-f4c2f6a24271',
      ephemeral: true,
    },
    {
      type: 'model.call_start',
      data: {
        turnId: '35',
        model: 'claude-opus-4.7',
      },
      ephemeral: true,
      id: '4291d374-43dc-4547-aae1-c772d31d6ffe',
      timestamp: '2026-07-24T01:57:27.191Z',
      parentId: '080d2918-29d2-4da6-b115-3fe37825b5d2',
    },
    {
      type: 'assistant.turn_start',
      data: {
        turnId: '10',
        interactionId: '490125b8-4fb4-40b5-9247-961b9c0f8c58',
      },
      id: '03549a21-d806-488e-9d7d-37729b18401c',
      timestamp: '2026-07-24T15:24:00.835Z',
      parentId: '6ce974b1-13f4-4080-868c-2fecf5c9e3b6',
    },
    {
      type: 'assistant.turn_end',
      data: {
        turnId: '9',
      },
      id: '6ce974b1-13f4-4080-868c-2fecf5c9e3b6',
      timestamp: '2026-07-24T15:24:00.830Z',
      parentId: '025f9abb-10e7-4474-ac71-43659df9cb27',
    },
    {
      type: 'assistant.tool_call_delta',
      data: {
        toolCallId: 'toolu_vrtx_01CunyjdMsfGLWe7ZUbrifGM',
        toolName: 'task_complete',
        inputDelta: '{"summary"',
      },
      ephemeral: true,
      id: '28829de0-90c9-4e64-bcc2-d5ac496ac416',
      timestamp: '2026-07-24T02:19:57.143Z',
      parentId: '686727b9-b910-44ba-81ce-f81fd59fafef',
    },
    {
      type: 'tool.execution_start',
      data: {
        toolCallId: 'call_U5d005rFIEgTMayq1nlHFkX8',
        toolName: 'view',
        arguments: {
          path: '/tmp/1784906593588-copilot-tool-output-b93535.txt',
          view_range: [537, 596],
        },
        turnId: '9',
        model: 'gpt-5.5',
      },
      id: '993d621a-a2cb-4f35-a27d-dfded5c4874c',
      timestamp: '2026-07-24T15:24:00.749Z',
      parentId: '04675368-58ad-4238-8827-f340f0160a30',
    },
    {
      type: 'tool.execution_complete',
      data: {
        toolCallId: 'call_U5d005rFIEgTMayq1nlHFkX8',
        model: 'gpt-5.5',
        interactionId: '490125b8-4fb4-40b5-9247-961b9c0f8c58',
        turnId: '9',
        success: true,
        result: {
          content: 'tool output',
          detailedContent: 'detailed tool output',
        },
        toolTelemetry: {
          properties: {
            command: 'view',
          },
          metrics: {
            resultLength: 11,
          },
          restrictedProperties: {},
        },
      },
      id: '025f9abb-10e7-4474-ac71-43659df9cb27',
      timestamp: '2026-07-24T15:24:00.761Z',
      parentId: '993d621a-a2cb-4f35-a27d-dfded5c4874c',
    },
    {
      type: 'assistant.idle',
      data: {},
      ephemeral: true,
      id: 'f0562ce0-bccb-47b2-8f82-8e5f9a052499',
      timestamp: '2026-07-24T02:51:38.974Z',
      parentId: 'ac1aa0cb-52e1-4e3b-8cef-c66141b1221b',
    },
    {
      type: 'session.usage_checkpoint',
      data: {
        totalNanoAiu: 2_839_800_000,
        totalPremiumRequests: 0,
        modelCacheState: [
          {
            modelId: 'gpt-5.5',
            cacheExpiresAt: '2026-07-25T02:59:34.017Z',
            cacheTtlSeconds: 86_400,
          },
        ],
      },
      id: '5f241b04-9d98-4e6f-b9df-b996f59f13f7',
      timestamp: '2026-07-24T02:59:36.941Z',
      parentId: 'd7bbb7ab-faf7-40fd-b812-9714e5011316',
    },
    {
      type: 'session.info',
      data: {
        infoType: 'file_created',
        message: '/home/sandbox/workspace/src/app/theme.ts',
      },
      ephemeral: true,
      id: '21ace379-29bf-49bb-8da2-df8da532cee8',
      timestamp: '2026-07-24T03:23:13.739Z',
      parentId: '5a318e85-d829-42f1-a068-e09b5a8b54d5',
    },
  ])('parses $type messages', message => {
    expect(parseMessage(message)).toMatchObject(message)
  })

  test('preserves unrecognized messages', () => {
    const message = {
      type: 'unknown.event',
      data: {
        nested: {
          value: 42,
        },
      },
      ephemeral: true,
      metadata: ['one', 'two'],
    }

    expect(parseMessage(message)).toEqual(message)
  })

  test('does not treat malformed known messages as unrecognized', () => {
    expect(() => parseMessage({type: 'assistant.turn_start', data: {}})).toThrow()
  })
})
