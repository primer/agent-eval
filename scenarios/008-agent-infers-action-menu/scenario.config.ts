import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent selects an appropriate component for secondary actions.',
  prompt: `Add archive, transfer, and delete actions to the repository header without crowding the existing primary actions.`,
  tags: ['component', 'menu', 'vite'],
})
