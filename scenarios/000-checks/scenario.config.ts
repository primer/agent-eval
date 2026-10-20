import {createESLintCheck, defineConfig} from '@primer/agent-eval/scenario'
import type {JsonTestResults} from 'vitest/node'

export default defineConfig({
  prompt: `Example prompt`,
  checks: [
    {
      name: 'node-tests',
      description: 'Example for node-based tests with vitest',
      files: ['vitest.config.scenario.ts', 'scenario.test.ts'],
      async run({sandbox}) {
        const commandResult = await sandbox.runCommand(
          'npx',
          ['vitest', 'run', '--config', 'vitest.config.scenario.ts'],
          {
            allowNonZeroExitCode: true,
          },
        )

        if (commandResult.exitCode !== 0 && commandResult.exitCode !== 1) {
          throw new Error(`Vitest failed with exit code ${commandResult.exitCode}: ${commandResult.stderr}`)
        }

        const contents = await sandbox.readFile('vitest-scenario-report.json')
        const json: JsonTestResults = JSON.parse(contents)

        return {
          outcomes: json.testResults.flatMap(({assertionResults}) => {
            return assertionResults.map(assertionResult => {
              return {
                type: 'outcome',
                status:
                  assertionResult.status === 'passed'
                    ? 'passed'
                    : assertionResult.status === 'failed'
                      ? 'failed'
                      : 'skipped',
              }
            })
          }),
        }
      },
    },
    {
      name: 'browser-tests',
      description: 'Example for browser-based tests with vitest',
      files: ['vitest.config.browser.scenario.ts', 'scenario.browser.test.ts'],
      async run({sandbox}) {
        await sandbox.runCommand('npx', ['playwright', 'install'])

        const commandResult = await sandbox.runCommand(
          'npx',
          ['vitest', 'run', '--config', 'vitest.config.browser.scenario.ts'],
          {
            allowNonZeroExitCode: true,
          },
        )

        if (commandResult.exitCode !== 0 && commandResult.exitCode !== 1) {
          throw new Error(`Vitest failed with exit code ${commandResult.exitCode}: ${commandResult.stderr}`)
        }

        const contents = await sandbox.readFile('vitest-browser-scenario-report.json')
        const json: JsonTestResults = JSON.parse(contents)

        return {
          outcomes: json.testResults.flatMap(({assertionResults}) => {
            return assertionResults.map(assertionResult => {
              return {
                type: 'outcome',
                status:
                  assertionResult.status === 'passed'
                    ? 'passed'
                    : assertionResult.status === 'failed'
                      ? 'failed'
                      : 'skipped',
              }
            })
          }),
        }
      },
    },
    createESLintCheck({
      name: 'eslint',
      configPath: 'eslint.config.scenario.js',
      lintPaths: ['src'],
    }),
  ],
})
