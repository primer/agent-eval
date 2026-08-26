import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent composes current components into an issue-filtering pattern.',
  prompt: `Add controls for filtering the issue list by author, label, and open or closed status.`,
  tags: ['filter', 'pattern', 'vite'],
})
