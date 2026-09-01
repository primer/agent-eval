import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent implements a persistent user-controlled theme preference.',
  prompt: `Add an appearance setting with system, light, and dark choices. Apply the choice immediately and remember it across visits.`,
  tags: ['interaction', 'theme', 'theming', 'vite'],
})
