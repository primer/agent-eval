import path from 'node:path'
import {randomUUID} from 'node:crypto'
import * as z from 'zod/mini'
import type {CheckConfig} from '../check'

type ESLintCheckOptions = {
  name: string
  configPath: string
  lintPaths: Array<string>
  files?: Array<string>
}

const ReportSchema = z.array(
  z.object({
    filePath: z.string().check(z.minLength(1)),
    errorCount: z.number().check(z.int(), z.gte(0)),
    warningCount: z.number().check(z.int(), z.gte(0)),
  }),
)

function parseReport(contents: string) {
  try {
    return ReportSchema.parse(JSON.parse(contents))
  } catch (cause) {
    throw new Error('ESLint did not produce a valid lint report', {cause})
  }
}

function createESLintCheck({name, configPath, lintPaths, files = []}: ESLintCheckOptions): CheckConfig {
  const paths = z
    .array(z.string().check(z.minLength(1)))
    .check(z.minLength(1))
    .parse(lintPaths)
  return {
    name,
    files: [configPath, ...files],
    async run({sandbox, stagedFiles}) {
      const stagedConfigPath = path.isAbsolute(configPath)
        ? stagedFiles?.find(file => path.resolve(file.filepath) === path.resolve(configPath))?.relativePath
        : configPath
      if (!stagedConfigPath) {
        throw new Error(`ESLint config file was not staged: ${configPath}`)
      }

      const reportPath = `/tmp/agent-eval-eslint-${randomUUID()}.json`
      try {
        const command = await sandbox.runCommand(
          'npx',
          [
            'eslint',
            '--config',
            stagedConfigPath,
            '--format',
            'json',
            '--output-file',
            reportPath,
            '--max-warnings',
            '0',
            '--',
            ...paths,
          ],
          {allowNonZeroExitCode: true},
        )
        if (command.exitCode !== 0 && command.exitCode !== 1) {
          throw new Error(`ESLint failed with exit code ${command.exitCode}: ${command.stderr}`)
        }

        const report = parseReport(await sandbox.readFile(reportPath))
        const failedFiles = report.filter(result => result.errorCount > 0 || result.warningCount > 0)
        if (
          report.length === 0 ||
          (command.exitCode === 1 && failedFiles.length === 0) ||
          (command.exitCode === 0 && failedFiles.length > 0)
        ) {
          throw new Error(`ESLint did not produce usable lint outcomes${command.stderr ? `: ${command.stderr}` : ''}`)
        }

        return {
          outcomes: report.map(result => ({
            type: 'outcome',
            id: result.filePath,
            status: result.errorCount === 0 && result.warningCount === 0 ? 'passed' : 'failed',
          })),
        }
      } finally {
        await sandbox.runCommand('rm', ['-f', reportPath])
      }
    },
  }
}

export {createESLintCheck}
export type {ESLintCheckOptions}
