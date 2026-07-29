import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  description: 'Evaluate whether the agent builds a sign-up form with Primer form components.',
  prompt: `Update the index page to render a sign-up form. The form does not need to post to an endpoint, I am only working on the UI for now.`,
  tags: ['baseline', 'component', 'form', 'nextjs', 'primer'],
})
