import {describe, expect, test} from 'vitest'
import {McpConfigFileSchema, McpServerConfigSchema} from './mcp-config'

describe('McpServerConfigSchema', () => {
  test('parses a local MCP server configuration', () => {
    expect(
      McpServerConfigSchema.parse({
        command: 'npx',
        type: 'local',
        args: ['example-server'],
        env: {
          TOKEN: 'token',
        },
        tools: ['example'],
      }),
    ).toEqual({
      command: 'npx',
      type: 'local',
      args: ['example-server'],
      env: {
        TOKEN: 'token',
      },
      tools: ['example'],
    })
  })

  test('rejects unsupported server types', () => {
    expect(() => {
      McpServerConfigSchema.parse({
        command: 'https://example.com',
        type: 'remote',
      })
    }).toThrow()
  })
})

test('McpConfigFileSchema parses named servers', () => {
  expect(
    McpConfigFileSchema.parse({
      mcpServers: {
        example: {
          command: 'example-server',
          type: 'local',
        },
      },
    }),
  ).toEqual({
    mcpServers: {
      example: {
        command: 'example-server',
        type: 'local',
      },
    },
  })
})
