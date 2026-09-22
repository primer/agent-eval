import {defineConfig} from '@primer/agent-eval/scenario'
import type {JsonTestResults} from 'vitest/node'

export default defineConfig({
  description: 'Evaluate whether the agent builds a sign-up form with Primer form components.',
  prompt: `Update the index page to render a sign-up form. The form does not need to post to an endpoint, I am only working on the UI for now.`,
  tags: ['baseline', 'component', 'form', 'nextjs', 'primer'],
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
})
