import {defineConfig} from '@primer/agent-eval/benchmark'

export default defineConfig({
  name: 'checks',
  description: 'checks benchmark for end-to-end testing',
  models: [
    {
      name: 'gpt-5.6-luna',
      reasoningEfforts: ['low'],
    },
  ],
  capabilities: [
    {
      name: 'judge',
      scenarios: ['000-checks'],
    },
  ],
})
