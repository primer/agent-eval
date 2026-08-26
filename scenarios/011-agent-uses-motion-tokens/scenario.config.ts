import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent uses motion tokens and respects reduced-motion preferences.',
  prompt: `Add a short transition when the details panel expands or collapses. Keep the interaction comfortable for people who prefer reduced motion.`,
  tags: ['accessibility', 'motion', 'tokens', 'vite'],
})
