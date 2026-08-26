import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Design System',
  description: 'Benchmark the performance of different design system approaches.',
  capabilities: [
    {
      name: 'Uses components',
      scenarios: [
        // Uses component from the design system unsolicited (e.g. when referring to a button)
        // Does not re-create a component that already exists
      ],
    },
    {
      name: 'Infers correct component based on usage',
      scenarios: [
        // When talking broadly about an action or case, translates to
        // components in Primer instead of creating a new component
      ],
    },
    {
      name: 'Uses tokens',
      scenarios: [
        // Color tokens
        // Size tokens
        // Typography tokens
        // Motion tokens
      ],
    },
    {
      name: 'Infers correct token based on usage',
      scenarios: [
        // Given a specific context it can find the correct token
      ],
    },
    {
      name: 'Uses icons',
      scenarios: [
        // Uses icons from Primer before creating its own
        // Does not use icons from other libraries
        // Suggests creating an issue or contributing to primer/octicons if
        // missing
      ],
    },
    {
      name: 'Infers correct icon based on usage',
      scenarios: [
        // Given a specific context it finds the right icon to use
      ],
    },
    {
      name: 'Uses UI patterns',
      scenarios: [
        // Given a specific context it infers what components to use and how to
        // combine them (forms, loading states, empty states, etc)
      ],
    },
    {
      name: 'Uses utilities',
      scenarios: [
        // Prefers importing and using hooks instead of re-implementing them
      ],
    },
    {
      name: 'Getting started',
      scenarios: [
        // New project
      ],
    },
    {
      name: 'Theming',
      scenarios: [
        // Bringing in primitives
        // Theme switching
      ],
    },
    {
      name: 'Works with TailwindCSS',
      scenarios: [
        // New project can bring in tailwindcss
        // Uses correct utility classes
      ],
    },
  ],
})
