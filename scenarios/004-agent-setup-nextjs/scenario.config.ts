import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent configures a Next.js project to use Primer.',
  prompt: `Setup this project to work with Primer. Including a default page layout in app.tsx.`,
  tags: ['baseline', 'nextjs', 'primer', 'setup'],
})
