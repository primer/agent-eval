import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent uses design tokens when styling with Tailwind CSS.',
  prompt: `Use Tailwind utility classes to style the deployment status panel while keeping its colors and spacing aligned with the design system.`,
  tags: ['tailwindcss', 'tokens', 'vite'],
})
