import {defineConfig} from '@primer/agent-eval/benchmark'

export default defineConfig({
  name: 'noop',
  description: 'noop benchmark for end-to-end testing',
  models: [
    {
      name: 'gpt-5.6-luna',
      reasoningEfforts: ['low'],
    },
  ],
  async setup() {
    console.log('global setup')
  },
  capabilities: [
    {
      name: 'noop',
      scenarios: ['001-agent-uses-button-from-primer'],
      async setup() {
        console.log('local setup')
      },
    },
  ],
})
