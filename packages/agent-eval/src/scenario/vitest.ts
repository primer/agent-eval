import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import type {CheckConfig} from '../check'

type VitestCheckOptions = {
  name: string
  configPath: string
  testPaths: Array<string>
}

const ReportSchema = z.object({
  numTotalTests: z.number().check(z.int(), z.gte(0)),
  numFailedTests: z.number().check(z.int(), z.gte(0)),
  testResults: z.array(
    z.object({
      message: z.string(),
      assertionResults: z.array(
        z.object({
          fullName: z.string(),
          status: z.enum(['passed', 'failed', 'pending', 'todo', 'skipped']),
        }),
      ),
    }),
  ),
})

function parseReport(contents: string) {
  try {
    return ReportSchema.parse(JSON.parse(contents))
  } catch (cause) {
    throw new Error('Vitest did not produce a valid test report', {cause})
  }
}

function createVitestCheck({name, configPath, testPaths}: VitestCheckOptions): CheckConfig {
  return {
    name,
    files: [configPath, ...testPaths],
    async run({sandbox}) {
      const reportPath = `/tmp/agent-eval-vitest-${randomUUID()}.json`
      try {
        const command = await sandbox.runCommand(
          'npx',
          ['vitest', 'run', '--config', configPath, '--reporter=json', '--outputFile', reportPath, ...testPaths],
          {allowNonZeroExitCode: true},
        )
        if (command.exitCode !== 0 && command.exitCode !== 1) {
          throw new Error(`Vitest failed with exit code ${command.exitCode}: ${command.stderr}`)
        }

        const report = parseReport(await sandbox.readFile(reportPath))
        const assertions = report.testResults.flatMap(result => result.assertionResults)
        const failedTests = assertions.filter(assertion => assertion.status === 'failed').length
        if (
          assertions.length === 0 ||
          report.testResults.some(result => result.message !== '') ||
          report.numTotalTests !== assertions.length ||
          report.numFailedTests !== failedTests ||
          (command.exitCode === 1 && failedTests === 0) ||
          (command.exitCode === 0 && failedTests !== 0)
        ) {
          throw new Error(`Vitest did not produce usable test outcomes: ${command.stderr}`)
        }

        return {
          outcomes: assertions.map(assertion => ({
            type: 'outcome',
            id: assertion.fullName,
            status: assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped',
          })),
        }
      } finally {
        await sandbox.runCommand('rm', ['-f', reportPath])
      }
    },
  }
}

export {createVitestCheck}
export type {VitestCheckOptions}
