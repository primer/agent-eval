import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  prompt: `Update the index page to use a primary button with the text 'Submit'`,
  tags: ['baseline', 'button', 'component', 'nextjs', 'primer'],
})
