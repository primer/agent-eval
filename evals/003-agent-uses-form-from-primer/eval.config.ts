import {defineConfig} from '@primer/agent-eval/config'

export default defineConfig({
  prompt: `Update the index page to render a sign up form. Follow the Primer form guidance at https://primer.style/product/ui-patterns/forms/: use Primer form components from @primer/react (such as FormControl and TextInput), wrap the inputs in a semantic <form> element, and use the Primer Button to submit the form. The form does not need to post to an endpoint.`,
})
