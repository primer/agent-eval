import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent uses an existing component when adding pagination.',
  prompt: `Add pagination controls below the issue list. Show 25 issues per page and include previous and next navigation.`,
  tags: ['component', 'pagination', 'vite'],
})
