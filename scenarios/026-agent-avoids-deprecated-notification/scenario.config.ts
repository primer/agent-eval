import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent avoids deprecated components when adding a page-level warning.',
  prompt: `Add a dismissible page-level warning above the repository settings when branch protection is disabled. Include a link to enable branch protection.`,
  tags: ['banner', 'component', 'deprecated', 'vite'],
})
