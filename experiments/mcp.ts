import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'MCP',
  description: 'Compare MCP versus local instructions performance for Primer usage.',
  models: [
    {name: 'gpt-5.5', reasoningEfforts: ['high']},
    {name: 'claude-opus-4.7', reasoningEfforts: ['high']},
    {name: 'claude-sonnet-4.6', reasoningEfforts: ['high']},
  ],
  scenarios: ['001-agent-uses-button-from-primer', '002-agent-uses-octicon-from-primer'],
  treatments: [
    {
      name: 'MCP with local instructions',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction(
          `For any UI-related change, React component change, styling change, accessibility change, icon change, or design-system question, use the Primer MCP server before editing.`,
        )
        await sandbox.runCommand('npm', ['install', '-g', '@primer/mcp@latest'])
        await sandbox.addMcpServer('primer', {
          type: 'local',
          command: 'npx',
          args: ['--no-install', '@primer/mcp'],
          tools: ['*'],
        })
      },
    },
    {
      name: 'Local instructions',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction(
          `For any UI-related change, React component change, styling change, accessibility change, icon change, or design-system question, refer to the Primer documentation before editing.`,
        )
      },
    },
  ],
})
