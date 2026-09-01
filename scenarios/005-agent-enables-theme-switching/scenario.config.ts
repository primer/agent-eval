import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent enables every available Primer color scheme.',
  prompt: `Enable support for switching between all available color schemes.`,
  tags: ['accessibility', 'baseline', 'nextjs', 'primer', 'theming'],
})
