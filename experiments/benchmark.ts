import {defineConfig} from '@primer/agent-eval/experiment'

export default defineConfig({
  name: 'benchmark',
  description: 'An end-to-end test for running experiments against benchmarks',
  models: ['gpt-5.6-luna'],
  benchmark: 'noop',
  treatments: [
    {
      name: 'noop',
      async setup() {
        console.log('local setup')
      },
    },
  ],
})
