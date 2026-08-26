import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent infers the appropriate icon for a compact action.',
  prompt: `Add a compact control next to the commit SHA that copies it to the clipboard.`,
  tags: ['component', 'icon', 'vite'],
})
