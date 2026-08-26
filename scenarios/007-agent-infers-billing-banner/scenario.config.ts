import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent selects an appropriate component for a persistent warning.',
  prompt: `Show a persistent warning at the top of the page when an account has a past-due balance. Include a link to billing settings.`,
  tags: ['banner', 'component', 'vite'],
})
