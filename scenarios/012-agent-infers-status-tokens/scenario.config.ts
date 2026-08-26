import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent chooses semantically correct status tokens.',
  prompt: `Update the deployment list so successful and failed deployments are easy to distinguish without relying on text alone.`,
  tags: ['color', 'status', 'tokens', 'vite'],
})
