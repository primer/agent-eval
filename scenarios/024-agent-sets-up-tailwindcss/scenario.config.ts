import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent configures Tailwind CSS alongside the design system.',
  prompt: `Add Tailwind CSS to this Vite application and use it to lay out the default page without breaking the existing design-system styles.`,
  tags: ['setup', 'tailwindcss', 'vite'],
})
