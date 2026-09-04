import {describe, expect, test} from 'vitest'
import {KNOWN_MESSAGE_TYPES, KnownMessageSchema, parseMessage} from './copilot-cli'

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
      type: 'model.message',
      data: {
        kind: 'message',
        turn: 0,
        message: {
          role: 'assistant',
          content: 'Done.',
          outputTokens: 42,
        },
      },
      ephemeral: true,
      id: 'dbf7cd98-649a-44c2-b013-680c902773ac',
      timestamp: '2026-09-04T01:06:13.385Z',
      parentId: '7e3943af-9aca-4042-b1fd-92a390203597',
    },
    {
      type: 'user.message',
      data: {
        content: "Update the index page to use a primary button with the text 'Submit'",
        transformedContent: "Update the index page to use a primary button with the text 'Submit'",
        supportedNativeDocumentMimeTypes: [],
        agentMode: 'autopilot',
        interactionId: '40a03f57-636f-41be-bef9-cfe71591862a',
        parentAgentTaskId: 'b5c96c9d-a61b-4689-9720-455a5a1e2644',
      },
      id: '30d361b9-068e-4ebe-bef0-857a8d92e5ab',
      timestamp: '2026-09-01T21:29:34.818Z',
      parentId: '0344de20-b203-4642-a644-4cc19a9283ac',
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
      type: 'tool.execution_complete',
      data: {
        toolCallId: 'toolu_vrtx_01KXX9FPEXPGxLgPkiSwZcMr',
        model: 'claude-opus-4.7',
        interactionId: '9baa31f1-da29-4890-8344-b2d2ff059132',
        turnId: '6',
        success: false,
        error: {
          message: "MCP server 'primer': Tool execution failed",
          code: 'failure',
        },
        toolTelemetry: {
          metrics: {
            mcp_result_content_bytes: 0,
          },
        },
      },
      id: 'a74c5c8c-1dfe-493d-a779-b1598bd22ffc',
      timestamp: '2026-07-24T16:28:43.024Z',
      parentId: '2fa47aa3-4f30-4959-a0cc-68295236ea73',
    },
    {
      type: 'assistant.message',
      data: {
        messageId: '19c1246c-a77f-4b60-bb06-7679ebb577e1',
        content: 'Here is the summary of the changes.',
        toolRequests: [],
        interactionId: 'eb5e3f1d-e742-4e69-9d82-cdf199fca42b',
        turnId: '8',
        requestId: '00000-1e2d12fa-7daf-434a-b101-f0ad5e654bec',
      },
      id: '3afee1ac-f9eb-44ca-b8b8-b50e9c89e015',
      timestamp: '2026-08-17T00:23:26.072Z',
      parentId: '2b1722fe-509e-4368-8c8b-2ae8985099b6',
    },
    {
      type: 'assistant.message',
      data: {
        messageId: '99e762aa-0196-42be-8756-39ba3c294a07',
        content: '',
        toolRequests: [
          {
            toolCallId: 'call_oLjXYouZFO1PA5D6u8d54cFX',
            name: 'glob',
            arguments: {
              pattern: '**/*',
              paths: '/home/sandbox/workspace',
            },
            type: 'function',
            intentionSummary: '**/*',
          },
        ],
        interactionId: 'feb477c9-0fb1-47d5-bd08-b397389ec2da',
        turnId: '0',
        reasoningOpaque: 'opaque',
        encryptedContent: 'encrypted',
      },
      id: '0c89050a-a6f6-4cd5-8ded-7e25d70b01bc',
      timestamp: '2026-09-01T21:35:25.627Z',
      parentId: '2ac75cd3-5bf3-4986-a5b2-00cfa4b6e9f5',
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

  test('parses sub-agent user messages without an agent mode', () => {
    const message = {
      type: 'user.message',
      data: {
        content: 'Run the build command `npm run build` to see if it succeeds.',
        transformedContent:
          '<current_datetime>2026-09-04T00:43:56.551+00:00</current_datetime>\n\nRun the build command `npm run build` to see if it succeeds.',
        source: 'agent-f13fa250-5bee-4bfc-8356-5b91a7f72f05',
        supportedNativeDocumentMimeTypes: [],
        delivery: 'idle',
        interactionId: '0c57cce9-3187-4397-b4ae-d6131b882626',
        turnId: '0',
        parentAgentTaskId: '5bbe4674-f7e7-4ef2-a532-29eaef862529',
      },
      agentId: 'f55e8634-e6a7-4b8c-a002-8fa22e9a55cd',
      id: 'b8d674d7-f16c-455c-83f5-a7366407445a',
      timestamp: '2026-09-04T00:43:56.551Z',
      parentId: 'b390bc41-c964-4e13-b3a3-12fb8f2e6303',
    }

    expect(parseMessage(message)).toMatchObject(message)
  })

  test('does not treat malformed known messages as unrecognized', () => {
    expect(() => parseMessage({type: 'assistant.turn_start', data: {}})).toThrow()
  })

  test('keeps known type set in sync with schema', () => {
    const schemaTypes = new Set(
      KnownMessageSchema.def.options.map(schema => schema.def.shape.type.def.values[0] as string),
    )
    expect(schemaTypes).toEqual(KNOWN_MESSAGE_TYPES)
  })
})
