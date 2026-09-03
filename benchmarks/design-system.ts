import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Design System',
  description: 'Benchmark the performance of agents with different design system tasks.',
  models: [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'claude-opus-5',
    'claude-sonnet-5',
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
  ],
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
  capabilities: [
    {
      name: 'Uses appropriate components by default',
      scenarios: ['001-agent-uses-button-from-primer', '003-agent-uses-form-from-primer'],
    },
    {
      name: 'Uses Octicons by default for iconography',
      scenarios: ['002-agent-uses-octicon-from-primer'],
    },
    {
      name: 'Sets up new projects with Primer',
      scenarios: ['004-agent-setup-nextjs', '005-agent-enables-theme-switching'],
    },
    // {
    //   name: 'Infers correct component based on usage',
    //   scenarios: ['007-agent-infers-billing-banner', '008-agent-infers-action-menu'],
    // },
    // {
    //   name: 'Composes components correctly',
    //   scenarios: [],
    // },
    // {
    //   name: 'Uses documented component APIs',
    //   scenarios: [],
    // },
    // {
    //   name: 'Uses tokens',
    //   scenarios: [
    //     '009-agent-uses-layout-and-color-tokens',
    //     '010-agent-uses-typography-tokens',
    //     '011-agent-uses-motion-tokens',
    //   ],
    // },
    // {
    //   name: 'Infers correct token based on usage',
    //   scenarios: ['012-agent-infers-status-tokens', '013-agent-infers-compact-control-tokens'],
    // },
    // {
    //   name: 'Uses icons',
    //   scenarios: ['002-agent-uses-octicon-from-primer', '014-agent-replaces-custom-icons-with-octicons'],
    // },
    // {
    //   name: 'Infers correct icon based on usage',
    //   scenarios: ['015-agent-infers-copy-icon'],
    // },
    // {
    //   name: 'Uses UI patterns',
    //   scenarios: [
    //     '003-agent-uses-form-from-primer',
    //     '016-agent-uses-loading-and-empty-state-patterns',
    //     '017-agent-uses-confirmation-pattern',
    //     '018-agent-uses-filter-pattern',
    //   ],
    // },
    // {
    //   name: 'Implements navigation patterns',
    //   scenarios: [],
    // },
    // {
    //   name: 'Applies accessibility guidance',
    //   scenarios: [],
    // },
    // {
    //   name: 'Builds responsive interfaces',
    //   scenarios: [],
    // },
    // {
    //   name: 'Handles interaction states',
    //   scenarios: [],
    // },
    // {
    //   name: 'Uses utilities',
    //   scenarios: ['019-agent-uses-dismissal-utilities', '020-agent-uses-resize-observer-utility'],
    // },
    // {
    //   name: 'Extends the design system safely',
    //   scenarios: [],
    // },
    // {
    //   name: 'Getting started',
    //   scenarios: ['004-agent-setup-nextjs', '021-agent-sets-up-primer-in-vite'],
    // },
    // {
    //   name: 'Theming',
    //   scenarios: [
    //     '005-agent-enables-theme-switching',
    //     '022-agent-enables-automatic-theming',
    //     '023-agent-adds-theme-switcher',
    //   ],
    // },
    // {
    //   name: 'Supports accessible color modes',
    //   scenarios: [],
    // },
    // {
    //   name: 'Works with TailwindCSS',
    //   scenarios: ['024-agent-sets-up-tailwindcss', '025-agent-uses-tokens-with-tailwindcss'],
    // },
    // {
    //   name: 'Respects component maturity',
    //   scenarios: ['026-agent-avoids-deprecated-notification'],
    // },
  ],
})
