import {defineConfig} from '@primer/agent-eval/config'

export default defineConfig({
  prompt: `Update the index page to use a primary button with the text 'Submit'`,
  testFiles: ['eval.test.ts'],
})
