import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent correctly configures a Vite application to use the design system.',
  prompt: `Set up this Vite application to use our design system and update the default page to demonstrate that it is working.`,
  tags: ['setup', 'vite'],
})
