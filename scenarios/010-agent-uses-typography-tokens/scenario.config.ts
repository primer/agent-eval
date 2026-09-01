import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent uses role-appropriate typography tokens.',
  prompt: `Improve the typography of the documentation page. It contains a page title, introductory text, inline code, and a code example.`,
  tags: ['tokens', 'typography', 'vite'],
})
