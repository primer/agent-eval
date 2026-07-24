import path from 'node:path'
import {defineConfig} from '@primer/agent-eval/experiment'
import {listScenarios} from '@primer/agent-eval'

const scenarios = await listScenarios({
  directory: path.resolve(import.meta.dirname, '..', 'scenarios'),
})

export const experiment = defineConfig({
  name: 'Baseline',
  description: 'Baseline experiment to evaluate the performance of the agent with our recommended setup.',
  models: ['gpt-5.5', 'claude-opus-4.7'],
  scenarios: scenarios.map(scenario => scenario.id),
  treatments: [
    {
      name: 'Recommended',
      async setup({sandbox}) {
        // Setup the Primer MCP server locally
        await sandbox.runCommand('npm', ['install', '-g', '@primer/mcp@latest'])
        await sandbox.addMcpServer('primer', {
          type: 'local',
          command: 'npx',
          args: ['--no-install', '@primer/mcp'],
          tools: ['*'],
        })
      },
    },
  ],
})
