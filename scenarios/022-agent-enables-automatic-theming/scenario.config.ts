import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent configures automatic light and dark theme support.',
  prompt: `Make the application follow the user's system light or dark appearance setting.`,
  tags: ['theme', 'theming', 'vite'],
})
