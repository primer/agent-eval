import * as z from 'zod/mini'

/**
 * @see https://gofastmcp.com/integrations/mcp-json-configuration
 */
const McpServerConfigSchema = z.object({
  command: z.string(),
  type: z.literal('local'),
  args: z.optional(z.array(z.string())),
  env: z.optional(z.record(z.string(), z.string())),
  tools: z.optional(z.array(z.string())),
})

type McpServerConfig = z.infer<typeof McpServerConfigSchema>

const McpConfigFileSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema),
})

type McpConfigFile = z.infer<typeof McpConfigFileSchema>

export {McpServerConfigSchema, McpConfigFileSchema}
export type {McpConfigFile, McpServerConfig}
