import {describe, expect, test, vi} from 'vitest'
import {parseCheckConfig} from '../check'
import {VirtualHost} from '../host'
import {logger} from '../logger'
import {VirtualSandbox} from '../sandbox'
import type {Sandbox} from '../sandbox'
import {createESLintCheck, defineConfig} from '../scenario'
import type {ESLintCheckOptions} from '../scenario'

const options: ESLintCheckOptions = {
  name: 'eslint',
  configPath: 'eslint.config.scenario.js',
  lintPaths: ['src', 'lib/**/*.ts'],
}

function createResult(filePath = '/home/sandbox/workspace/src/index.ts', errorCount = 0, warningCount = 0) {
  return {filePath, errorCount, warningCount, fatalErrorCount: 0, messages: []}
}

async function createSandbox(contents: string | undefined, exitCode = 0) {
  const host = VirtualHost.create()
  const sandbox: Sandbox = await VirtualSandbox.create({host})
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
    if (command === 'npx') {
      const reportPath = args[args.indexOf('--output-file') + 1]
      if (contents !== undefined) {
        await sandbox.writeFile(reportPath, contents)
      }
      return {stdout: '', stderr: 'runner diagnostics', exitCode}
    }
    if (command === 'rm') {
      await host.fs.promises.rm(args[1], {force: true})
    }
    return {stdout: '', stderr: '', exitCode: 0}
  })
  return {sandbox, runCommand}
}

describe(createESLintCheck, () => {
  test('stages the private config and additional files without withholding lint targets', async () => {
    const host = VirtualHost.create()
    await host.fs.promises.mkdir('/scenario/helpers', {recursive: true})
    await host.fs.promises.writeFile('/scenario/eslint.config.scenario.js', '')
    await host.fs.promises.writeFile('/scenario/helpers/rules.js', '')
    const config = defineConfig({
      prompt: 'Implement a feature',
      checks: [createESLintCheck({...options, files: ['helpers']})],
    })

    const check = await parseCheckConfig(host, '/scenario', config.checks[0])

    expect(check.name).toBe('eslint')
    expect(check.files).toEqual([
      {filepath: '/scenario/eslint.config.scenario.js', relativePath: 'eslint.config.scenario.js'},
      {filepath: '/scenario/helpers', relativePath: 'helpers'},
    ])
    expect(createESLintCheck(options).files).toEqual([options.configPath])
  })

  test('uses the staged path for an absolute config path', async () => {
    const configPath = '/scenario/config/eslint.config.scenario.js'
    const host = VirtualHost.create()
    await host.fs.promises.mkdir('/scenario/config', {recursive: true})
    await host.fs.promises.writeFile(configPath, '')
    const config = defineConfig({
      prompt: 'Implement a feature',
      checks: [createESLintCheck({...options, configPath})],
    })

    const check = await parseCheckConfig(host, '/scenario', config.checks[0])
    const {sandbox: resource, runCommand} = await createSandbox(JSON.stringify([createResult()]))
    await using sandbox = resource

    await expect(check.run({sandbox, logger})).resolves.toEqual([
      {
        type: 'outcomes',
        outcomes: [{type: 'outcome', id: '/home/sandbox/workspace/src/index.ts', status: 'passed', annotations: []}],
      },
    ])

    expect(check.files).toEqual([{filepath: configPath, relativePath: 'config/eslint.config.scenario.js'}])
    expect(runCommand.mock.calls[0][1]?.slice(0, 3)).toEqual(['eslint', '--config', 'config/eslint.config.scenario.js'])
  })

  test('runs ESLint with its JSON reporter, selected paths, and zero allowed warnings', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(JSON.stringify([createResult()]))
    await using sandbox = resource

    await expect(createESLintCheck({...options, files: ['helpers']}).run({sandbox, logger})).resolves.toEqual({
      outcomes: [{type: 'outcome', id: '/home/sandbox/workspace/src/index.ts', status: 'passed', annotations: []}],
    })
    const reportPath = runCommand.mock.calls[0][1]?.[6]
    expect(runCommand.mock.calls).toEqual([
      [
        'npx',
        [
          'eslint',
          '--config',
          options.configPath,
          '--format',
          'json',
          '--output-file',
          reportPath,
          '--max-warnings',
          '0',
          '--',
          ...options.lintPaths,
        ],
        {allowNonZeroExitCode: true},
      ],
      ['rm', ['-f', reportPath]],
    ])
    await expect(sandbox.readFile(reportPath!)).rejects.toThrow('ENOENT')
  })

  test('reports individual files as failed for either errors or warnings', async () => {
    const {sandbox: resource} = await createSandbox(
      JSON.stringify([
        createResult('/workspace/clean.ts'),
        createResult('/workspace/errors.ts', 2),
        createResult('/workspace/warnings.ts', 0, 1),
      ]),
      1,
    )
    await using sandbox = resource

    await expect(createESLintCheck(options).run({sandbox, logger})).resolves.toEqual({
      outcomes: [
        {type: 'outcome', id: '/workspace/clean.ts', status: 'passed', annotations: []},
        {type: 'outcome', id: '/workspace/errors.ts', status: 'failed', annotations: []},
        {type: 'outcome', id: '/workspace/warnings.ts', status: 'failed', annotations: []},
      ],
    })
  })

  test('preserves each lint diagnostic with its rule and location through check parsing', async () => {
    const report = [
      {
        ...createResult('/workspace/src/index.ts', 1, 1),
        messages: [
          {ruleId: 'no-undef', message: "'search' is not defined.", line: 3, column: 5},
          {ruleId: 'no-unused-vars', message: "'query' is never used.", line: 8, column: 7},
        ],
      },
      createResult('/workspace/src/clean.ts'),
    ]
    const host = VirtualHost.create()
    await host.fs.promises.mkdir('/scenario')
    await host.fs.promises.writeFile('/scenario/eslint.config.scenario.js', '')
    const check = await parseCheckConfig(host, '/scenario', createESLintCheck(options))
    const {sandbox: resource} = await createSandbox(JSON.stringify(report), 1)
    await using sandbox = resource

    await expect(check.run({sandbox, logger})).resolves.toEqual([
      {
        type: 'outcomes',
        outcomes: [
          {
            type: 'outcome',
            id: '/workspace/src/index.ts',
            status: 'failed',
            annotations: [
              {
                message: "'search' is not defined.",
                context: 'no-undef',
                location: {
                  path: '/workspace/src/index.ts',
                  line: 3,
                  column: 5,
                },
              },
              {
                message: "'query' is never used.",
                context: 'no-unused-vars',
                location: {
                  path: '/workspace/src/index.ts',
                  line: 8,
                  column: 7,
                },
              },
            ],
          },
          {
            type: 'outcome',
            id: '/workspace/src/clean.ts',
            status: 'passed',
            annotations: [],
          },
        ],
      },
    ])
  })

  test.each([
    {name: 'empty list', lintPaths: []},
    {name: 'empty path', lintPaths: ['']},
  ])('rejects empty lint targets: $name', ({lintPaths}) => {
    expect(() => createESLintCheck({...options, lintPaths})).toThrow()
  })

  test('rejects unexpected exits even when a valid report exists and removes the report', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(JSON.stringify([createResult()]), 2)
    await using sandbox = resource

    await expect(createESLintCheck(options).run({sandbox, logger})).rejects.toThrow(
      'ESLint failed with exit code 2: runner diagnostics',
    )
    const reportPath = runCommand.mock.calls[0][1]?.[6]
    await expect(sandbox.readFile(reportPath!)).rejects.toThrow('ENOENT')
  })

  test('rejects a missing report instead of using a stale report', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(undefined)
    await using sandbox = resource
    await sandbox.writeFile('eslint-scenario-report.json', JSON.stringify([createResult()]))

    await expect(createESLintCheck(options).run({sandbox, logger})).rejects.toThrow('ENOENT')
    expect(runCommand.mock.calls[1][0]).toBe('rm')
  })

  test('rejects command execution errors and still attempts cleanup', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(undefined)
    await using sandbox = resource
    runCommand.mockRejectedValueOnce(new Error('Unable to execute command'))

    await expect(createESLintCheck(options).run({sandbox, logger})).rejects.toThrow('Unable to execute command')
    expect(runCommand.mock.calls[1][0]).toBe('rm')
  })

  test('grades syntax errors in agent-authored files as failed outcomes', async () => {
    const {sandbox: resource} = await createSandbox(
      JSON.stringify([
        {
          ...createResult('/workspace/broken.ts', 1),
          fatalErrorCount: 1,
          messages: [{ruleId: null, message: 'Parsing error: Unexpected token'}],
        },
        createResult('/workspace/errors.ts', 1),
      ]),
      1,
    )
    await using sandbox = resource

    await expect(createESLintCheck(options).run({sandbox, logger})).resolves.toEqual({
      outcomes: [
        {
          type: 'outcome',
          id: '/workspace/broken.ts',
          status: 'failed',
          annotations: [
            {
              message: 'Parsing error: Unexpected token',
              location: {
                path: '/workspace/broken.ts',
              },
            },
          ],
        },
        {type: 'outcome', id: '/workspace/errors.ts', status: 'failed', annotations: []},
      ],
    })
  })

  test.each([
    {name: 'invalid JSON', contents: '{'},
    {name: 'non-array report', contents: '{}'},
    {name: 'missing counts', contents: JSON.stringify([{filePath: '/workspace/index.ts'}])},
    {name: 'invalid path', contents: JSON.stringify([{...createResult(), filePath: 1}])},
    {name: 'negative count', contents: JSON.stringify([{...createResult(), errorCount: -1}])},
    {name: 'fractional count', contents: JSON.stringify([{...createResult(), warningCount: 0.5}])},
    {name: 'invalid diagnostic', contents: JSON.stringify([{...createResult(), messages: [{message: 123}]}])},
    {
      name: 'invalid diagnostic location',
      contents: JSON.stringify([{...createResult(), messages: [{message: 'Failure', line: 0}]}]),
    },
  ])('rejects malformed reports: $name', async ({contents}) => {
    const {sandbox: resource, runCommand} = await createSandbox(contents)
    await using sandbox = resource

    await expect(createESLintCheck(options).run({sandbox, logger})).rejects.toThrow(
      'ESLint did not produce a valid lint report',
    )
    expect(runCommand.mock.calls[1][0]).toBe('rm')
  })

  test.each([
    {name: 'no files', report: [], exitCode: 0},
    {name: 'nonzero exit without failures', report: [createResult()], exitCode: 1},
    {name: 'successful exit with errors', report: [createResult('/workspace/index.ts', 1)], exitCode: 0},
    {name: 'successful exit with warnings', report: [createResult('/workspace/index.ts', 0, 1)], exitCode: 0},
  ])('rejects unusable outcomes: $name', async ({report, exitCode}) => {
    const {sandbox: resource} = await createSandbox(JSON.stringify(report), exitCode)
    await using sandbox = resource

    await expect(createESLintCheck(options).run({sandbox, logger})).rejects.toThrow(
      'ESLint did not produce usable lint outcomes: runner diagnostics',
    )
  })
})
