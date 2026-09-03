import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent chooses appropriate tokens for a compact toolbar.',
  prompt: `Make the repository file toolbar more compact while keeping its controls usable and consistently spaced.`,
  tags: ['controls', 'layout', 'tokens', 'vite'],
})
