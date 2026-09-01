import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent uses the requested icon from Primer Octicons.',
  prompt: `Update the index page to use a Search icon`,
  tags: ['baseline', 'icon', 'nextjs', 'primer'],
})
