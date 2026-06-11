import type {ExperimentConfig} from '@primer/agent-experiment'

export const experiment: ExperimentConfig = {
  name: 'MCP with server instructions',
  description:
    "Comparing `@primer/mcp` with and without server instructions to determine if server instructions improve the model's ability to follow instructions and complete tasks effectively. The experiment will involve two groups: one using `@primer/mcp` with server instructions and another using `@primer/mcp` without server instructions.",
  models: ['gpt-5.5'],
  evals: ['001-agent-uses-button-from-primer', '002-agent-uses-octicon-from-primer'],
  async setup({sandbox}) {
    await sandbox.addMcpServer('primer', {
      type: 'local',
      command: 'npx',
      args: ['--no-install', '@primer/mcp'],
      tools: ['*'],
    })
  },
  treatments: [
    {
      name: 'MCP with server instructions',
      async setup({sandbox}) {
        await sandbox.runCommand('npm', ['install', '-g', '@primer/mcp@0.0.0-20260516152658'])
      },
    },
    {
      name: 'MCP without server instructions',
      async setup({sandbox}) {
        await sandbox.runCommand('npm', ['install', '-g', '@primer/mcp@latest'])
      },
    },
  ],
}
