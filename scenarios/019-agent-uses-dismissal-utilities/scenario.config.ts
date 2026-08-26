import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent reuses design-system utilities for common dismissal behavior.',
  prompt: `Update the existing floating panel so it closes when the user clicks outside it or presses Escape. Preserve the current markup and positioning.`,
  tags: ['hooks', 'interaction', 'utilities', 'vite'],
})
