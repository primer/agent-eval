import {defineConfig} from '@primer/agent-eval/benchmark'

export default defineConfig({
  name: 'judge',
  description: 'judge benchmark for end-to-end testing',
  models: [
    {
      name: 'gpt-5.6-luna',
      reasoningEfforts: ['low'],
    },
  ],
  capabilities: [
    {
      name: 'judge',
      scenarios: ['000-llm-as-a-judge'],
    },
  ],
})
