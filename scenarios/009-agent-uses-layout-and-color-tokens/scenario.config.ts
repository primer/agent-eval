import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent uses design tokens for layout and color styling.',
  prompt: `Style the status summary card so its content is clearly grouped and visually distinct from the page background.`,
  tags: ['color', 'layout', 'tokens', 'vite'],
})
