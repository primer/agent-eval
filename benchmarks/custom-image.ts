import {defineConfig} from '@primer/agent-eval/benchmark'

export default defineConfig({
  name: 'custom-image',
  description: 'checks benchmark for custom image support',
  models: [
    {
      name: 'gpt-5.6-luna',
      reasoningEfforts: ['low'],
    },
  ],
  capabilities: [
    {
      name: 'custom-image',
      scenarios: ['000-custom-image'],
    },
  ],
})
