import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent applies established loading and empty-state patterns.',
  prompt: `Add appropriate loading and empty states to the repository list. The empty state should help the user create their first repository.`,
  tags: ['empty-state', 'loading', 'pattern', 'vite'],
})
