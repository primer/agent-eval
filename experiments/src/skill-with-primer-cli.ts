import type {ExperimentConfig} from '@primer/agent-experiment'
import path from 'node:path'

const PRIMER_CLI_TARBALL = path.join(import.meta.dirname, 'primer-cli-0.0.0.tgz')
const PRIMER_CLI_TARBALL_DESTINATION = '/tmp/primer-cli-0.0.0.tgz'

const PRIMER_CLI_INSTRUCTION =
  'For any UI-related change, React component change, styling change, accessibility change, icon change, or design-system question, use the primer-cli skill before editing.'

const PRIMER_CLI_SKILL = `Use the \`primer\` command to query Primer component, icon, and design-token information before making Primer-related changes.

The CLI is installed globally and is available as \`primer\`.

Use these commands as the starting points:

- \`primer --help\` to see available commands.
- \`primer --json components list\` to discover Primer React components.
- \`primer --json components get <ComponentName>\` to inspect component imports, props, usage docs, and examples.
- \`primer --json icons list\` to discover available Octicons.
- \`primer --json icons get <icon-name>\` to inspect the exact icon export and import path.
- \`primer --json tokens list --group <group>\` and \`primer --json tokens get <token-name>\` to inspect design tokens.

Prefer \`--json\` output when you need to read or compare results. Use the returned import paths, prop names, usage guidance, and examples directly in the code you edit.`

export const experiment: ExperimentConfig = {
  name: 'Skill with Primer CLI',
  description: 'Compare performance of existing MCP tooling to a skill with the Primer CLI',
  models: ['gpt-5.5', 'claude-opus-4.7', 'claude-sonnet-4.6'],
  evals: [
    '001-agent-uses-button-from-primer',
    '002-agent-uses-octicon-from-primer',
    '003-agent-uses-form-from-primer',
    '004-agent-uses-design-tokens-from-primer',
  ],
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
      name: 'Skill with Primer CLI',
      async setup({sandbox}) {
        await sandbox.copy(PRIMER_CLI_TARBALL, PRIMER_CLI_TARBALL_DESTINATION)
        await sandbox.runCommand('npm', ['install', '-g', PRIMER_CLI_TARBALL_DESTINATION])
        await sandbox.runCommand('primer', ['--help'])
        await sandbox.addAgentInstruction(PRIMER_CLI_INSTRUCTION)
        await sandbox.addAgentSkill(
          'primer-cli',
          'Use the Primer CLI to inspect Primer components, icons, design tokens, APIs, docs, and examples.',
          PRIMER_CLI_SKILL,
        )
      },
    },
  ],
}
