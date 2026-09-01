import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent replaces custom icons with maintained design-system icons.',
  prompt: `Replace the hand-drawn search, download, and trash icons in the toolbar with icons from the project's design system.`,
  tags: ['icon', 'octicons', 'vite'],
})
