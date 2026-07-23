import {describe, expect, test} from 'vitest'
import {parseMessage} from './copilot-cli.ts'

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
      type: 'assistant.message_start',
      data: {
        messageId: 'fbdb0ec9-32c3-4a1a-846b-2beb84bb8ae2',
      },
      id: '23067aad-f2e9-47ed-bc07-a656c1173a97',
      timestamp: '2026-05-22T15:53:12.261Z',
      parentId: '72748568-18fb-4fed-8c93-f4c2f6a24271',
      ephemeral: true,
    },
  ])('parses $type messages', message => {
    expect(parseMessage(message)).toMatchObject(message)
  })

  test('throws for unrecognized messages', () => {
    expect(() => parseMessage({type: 'assistant.unknown', data: {}})).toThrow()
  })
})
