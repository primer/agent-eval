import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent applies the established confirmation pattern to a destructive action.',
  prompt: `Let an administrator delete the repository after confirming the destructive action. Include clear cancel and confirm paths.`,
  tags: ['confirmation', 'dialog', 'pattern', 'vite'],
})
