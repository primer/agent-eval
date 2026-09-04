import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent uses a primary Primer button with the requested label.',
  prompt: `Update the index page to use a primary button with the text 'Submit'`,
  tags: ['baseline', 'button', 'component', 'nextjs', 'primer'],
})
