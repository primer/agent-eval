import {defineConfig} from '@primer/agent-eval/scenario'
import type {JsonTestResults} from 'vitest/node'

export default defineConfig({
  description: 'A lightweight end-to-end smoke test for judge scoring, rationale, and file-backed findings.',
  prompt: `Replace the Hello world content in src/App.tsx with a friendly empty state for a new project list. Include a heading and one short sentence encouraging the user to create their first project. Keep the existing App export and do not add dependencies.`,
  checks: [
    {
      name: 'node-tests',
      files: ['vitest.config.scenario.ts', 'scenario.test.ts'],
      async run({sandbox}) {
        const commandResult = await sandbox.runCommand(
          'npx',
          ['vitest', 'run', '--config', 'vitest.config.scenario.ts'],
          {allowNonZeroExitCode: true},
        )
        if (commandResult.exitCode !== 0 && commandResult.exitCode !== 1) {
          throw new Error(`Vitest failed with exit code ${commandResult.exitCode}: ${commandResult.stderr}`)
        }
        const contents = await sandbox.readFile('vitest-scenario-report.json')
        const json: JsonTestResults = JSON.parse(contents)
        if (commandResult.exitCode !== 0 && json.numFailedTests === 0) {
          throw new Error(`Vitest failed without reporting failed tests: ${commandResult.stderr}`)
        }
        return {
          outcomes: json.testResults.flatMap(({assertionResults}) => {
            return assertionResults.map(assertion => {
              return {
                type: 'outcome',
                id: assertion.fullName,
                status: assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped',
              }
            })
          }),
        }
      },
    },
  ],
  judges: [
    {
      name: 'empty-state-copy',
      description: 'Evaluate whether the empty state is clear, welcoming, and actionable.',
      model: {
        name: 'gpt-5.6-luna',
        reasoningEffort: 'low',
      },
      instructions: `Inspect src/App.tsx and any local components it renders. Judge only the user-facing copy: it should communicate that there are no projects yet and encourage creating the first one in a friendly, concise way. Do not grade styling, require a button, or require exact wording.`,
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
