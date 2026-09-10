import {defineConfig} from '@primer/agent-eval/scenario'

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
      async run({sandbox}) {
        await sandbox.runCommand('sh', [
          '-c',
          'npx vitest run --config "$1" "$2" || true',
          'vitest-run',
          'vitest.config.scenario.ts',
        ])

        const contents = await sandbox.readFile('vitest-scenario-report.json')
        const json: TestResults = JSON.parse(contents)
        return {
          type: 'outcome',
          results: json.testResults.flatMap(({assertionResults}) => {
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
    // {
    //   name: 'browser-tests',
    //   description: 'Example for browser-based tests with vitest',
    //   files: ['vitest.config.browser.scenario.ts', 'scenario.browser.test.ts'],
    //   async run({sandbox}) {
    //     await sandbox.runCommand('sh', [
    //       '-c',
    //       'npx vitest run --config "$1" "$2" || true',
    //       'vitest-run',
    //       'vitest.config.browser.scenario.ts',
    //     ])
    //   },
    // },
    // {
    //   name: 'eslint',
    //   description: 'Example for reporting on eslint checks',
    //   files: ['eslint.config.scenario.js'],
    //   async run({sandbox}) {
    //     //
    //   },
    // },
  ],
})
