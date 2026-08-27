import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Design System',
  description: 'Benchmark the performance of different design system approaches.',
  capabilities: [
    {
      name: 'Uses components',
      scenarios: ['001-agent-uses-button-from-primer', '006-agent-uses-pagination-component'],
    },
    {
      name: 'Infers correct component based on usage',
      scenarios: ['007-agent-infers-billing-banner', '008-agent-infers-action-menu'],
    },
    {
      name: 'Composes components correctly',
      scenarios: [],
    },
    {
      name: 'Uses documented component APIs',
      scenarios: [],
    },
    {
      name: 'Uses tokens',
      scenarios: [
        '009-agent-uses-layout-and-color-tokens',
        '010-agent-uses-typography-tokens',
        '011-agent-uses-motion-tokens',
      ],
    },
    {
      name: 'Infers correct token based on usage',
      scenarios: ['012-agent-infers-status-tokens', '013-agent-infers-compact-control-tokens'],
    },
    {
      name: 'Uses icons',
      scenarios: ['002-agent-uses-octicon-from-primer', '014-agent-replaces-custom-icons-with-octicons'],
    },
    {
      name: 'Infers correct icon based on usage',
      scenarios: ['015-agent-infers-copy-icon'],
    },
    {
      name: 'Uses UI patterns',
      scenarios: [
        '003-agent-uses-form-from-primer',
        '016-agent-uses-loading-and-empty-state-patterns',
        '017-agent-uses-confirmation-pattern',
        '018-agent-uses-filter-pattern',
      ],
    },
    {
      name: 'Implements navigation patterns',
      scenarios: [],
    },
    {
      name: 'Applies accessibility guidance',
      scenarios: [],
    },
    {
      name: 'Builds responsive interfaces',
      scenarios: [],
    },
    {
      name: 'Handles interaction states',
      scenarios: [],
    },
    {
      name: 'Uses utilities',
      scenarios: ['019-agent-uses-dismissal-utilities', '020-agent-uses-resize-observer-utility'],
    },
    {
      name: 'Extends the design system safely',
      scenarios: [],
    },
    {
      name: 'Getting started',
      scenarios: ['004-agent-setup-nextjs', '021-agent-sets-up-primer-in-vite'],
    },
    {
      name: 'Theming',
      scenarios: [
        '005-agent-enables-theme-switching',
        '022-agent-enables-automatic-theming',
        '023-agent-adds-theme-switcher',
      ],
    },
    {
      name: 'Supports accessible color modes',
      scenarios: [],
    },
    {
      name: 'Works with TailwindCSS',
      scenarios: ['024-agent-sets-up-tailwindcss', '025-agent-uses-tokens-with-tailwindcss'],
    },
    {
      name: 'Respects component maturity',
      scenarios: ['026-agent-avoids-deprecated-notification'],
    },
  ],
})
