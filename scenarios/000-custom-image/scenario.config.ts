import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Hello world',
  image: {
    dockerfile: 'Dockerfile',
  },
})
