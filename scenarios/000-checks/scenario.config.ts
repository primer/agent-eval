import {defineConfig} from '@primer/agent-eval/scenario'
import type {ESLint} from 'eslint'

type TestResults = {
  testResults: Array<{
    assertionResults: Array<{
      status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled'
    }>
  }>
}

export default defineConfig({
  prompt: `Example prompt`,
  checks: [
    {
      name: 'node-tests',
      description: 'Example for node-based tests with vitest',
      files: ['vitest.config.scenario.ts', 'scenario.test.ts'],
      async run({logger, sandbox}) {
        logger.info('Running node tests')

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
        const json: TestResults = JSON.parse(contents)

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
      async run({logger, sandbox}) {
        logger.info('Running browser tests')

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
        const json: TestResults = JSON.parse(contents)

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
      name: 'eslint',
      description: 'Example for reporting on eslint checks',
      files: ['eslint.config.scenario.js'],
      async run({logger, sandbox}) {
        logger.info('Running eslint checks')

        const commandResult = await sandbox.runCommand(
          'npx',
          [
            'eslint',
            '--config',
            'eslint.config.scenario.js',
            'src',
            '--format',
            'json',
            '--output-file',
            'eslint-scenario-report.json',
            '--max-warnings',
            '0',
          ],
          {
            allowNonZeroExitCode: true,
          },
        )

        if (commandResult.exitCode !== 0 && commandResult.exitCode !== 1) {
          throw new Error(`ESLint failed with exit code ${commandResult.exitCode}: ${commandResult.stderr}`)
        }

        const contents = await sandbox.readFile('eslint-scenario-report.json')
        const results: Array<ESLint.LintResult> = JSON.parse(contents)

        return {
          outcomes: results.map(result => {
            return {
              type: 'outcome',
              id: result.filePath,
              status: result.errorCount === 0 && result.warningCount === 0 ? 'passed' : 'failed',
            }
          }),
        }
      },
    },
  ],
})
