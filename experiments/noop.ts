import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'noop',
  description: 'A fast experiment for testing agent-eval',
  models: [
    {
      name: 'gpt-5.6-luna',
      reasoningEfforts: ['low'],
    },
  ],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'noop',
      async setup() {
        //
      },
    },
  ],
})
