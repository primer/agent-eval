import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent enables every available Primer color scheme.',
  prompt: `Enable support for switching between all available color schemes.`,
  tags: ['accessibility', 'baseline', 'nextjs', 'primer', 'theming'],
})
