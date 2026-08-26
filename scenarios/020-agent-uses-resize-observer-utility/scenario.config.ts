import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent reuses the design-system resize observer utility.',
  prompt: `Make the contribution chart update its dimensions whenever its container is resized.`,
  tags: ['hooks', 'responsive', 'utilities', 'vite'],
})
