import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'A lightweight end-to-end smoke test for judge scoring, rationale, and file-backed findings.',
  prompt: `Replace the Hello world content in src/App.tsx with a friendly empty state for a new project list. Include a heading and one short sentence encouraging the user to create their first project. Keep the existing App export and do not add dependencies.`,
  judges: [
    {
      name: 'empty-state-copy',
      description: 'Evaluate whether the empty state is clear, welcoming, and actionable.',
      judge: {
        model: {
          name: 'gpt-5.6-luna',
          reasoningEffort: 'low',
        },
        instructions: `Inspect src/App.tsx and any local components it renders. Judge only the user-facing copy: it should communicate that there are no projects yet and encourage creating the first one in a friendly, concise way. Do not grade styling, require a button, or require exact wording.`,
      },
      scores: [
        {
          value: 0,
          description:
            'The empty-state copy is missing, unclear, unwelcoming, or does not encourage creating a first project.',
        },
        {
          value: 1,
          description:
            'A heading and one short, friendly sentence clearly convey an empty project list and encourage creating the first project.',
        },
      ],
    },
  ],
})
