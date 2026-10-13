import {describe, expect, test, vi} from 'vitest'
import {parseCheckConfig} from '../check'
import {VirtualHost} from '../host'
import {logger} from '../logger'
import {VirtualSandbox} from '../sandbox'
import type {Sandbox} from '../sandbox'
import {createVitestCheck, defineConfig} from '../scenario'

const options = {
  name: 'tests',
  configPath: 'vitest.config.scenario.ts',
  testPaths: ['tests/first.test.ts', 'tests/second.test.ts'],
}

function createReport(statuses: Array<string> = ['passed']) {
  return {
    numTotalTests: statuses.length,
    numFailedTests: statuses.filter(status => status === 'failed').length,
    testResults: statuses.map((status, index) => ({
      message: '',
      assertionResults: [{fullName: `suite test ${index}`, status}],
    })),
  }
}

async function createSandbox(contents: string | undefined, exitCode = 0) {
  const sandbox: Sandbox = await VirtualSandbox.create()
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async (command, args = []) => {
    if (command === 'npx') {
      const reportPath = args[args.indexOf('--outputFile') + 1]
      if (contents !== undefined) {
        await sandbox.writeFile(reportPath, contents)
      }
      return {stdout: '', stderr: 'runner diagnostics', exitCode}
    }
    return {stdout: '', stderr: '', exitCode: 0}
  })
  return {sandbox, runCommand}
}

describe(createVitestCheck, () => {
  test('integrates with scenario config and stages the config and all test files', async () => {
    const host = VirtualHost.create()
    for (const filepath of [options.configPath, ...options.testPaths]) {
      await host.fs.promises.mkdir(`/scenario/${filepath.slice(0, filepath.lastIndexOf('/') + 1)}`, {recursive: true})
      await host.fs.promises.writeFile(`/scenario/${filepath}`, '')
    }
    const config = defineConfig({prompt: 'Implement a feature', checks: [createVitestCheck(options)]})

    const check = await parseCheckConfig(host, '/scenario', config.checks[0])

    expect(check.name).toBe('tests')
    expect(check.files).toEqual(
      [options.configPath, ...options.testPaths].map(relativePath => ({
        filepath: `/scenario/${relativePath}`,
        relativePath,
      })),
    )
  })

  test('runs the selected tests with a JSON reporter and cleans up its report', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(JSON.stringify(createReport()))
    await using sandbox = resource
    const check = createVitestCheck(options)

    await expect(check.run({sandbox, logger})).resolves.toEqual({
      outcomes: [{type: 'outcome', id: 'suite test 0', status: 'passed'}],
    })
    const reportPath = runCommand.mock.calls[0][1]?.[6]
    expect(runCommand.mock.calls).toEqual([
      [
        'npx',
        [
          'vitest',
          'run',
          '--config',
          options.configPath,
          '--reporter=json',
          '--outputFile',
          reportPath,
          ...options.testPaths,
        ],
        {allowNonZeroExitCode: true},
      ],
      ['rm', ['-f', reportPath]],
    ])
  })

  test('stages additional files and directories alongside the config and tests', async () => {
    const host = VirtualHost.create()
    const files = ['helpers/setup.ts', 'fixtures']
    await host.fs.promises.mkdir('/scenario/helpers', {recursive: true})
    await host.fs.promises.mkdir('/scenario/tests', {recursive: true})
    await host.fs.promises.mkdir('/scenario/fixtures', {recursive: true})
    for (const filepath of [options.configPath, ...options.testPaths, files[0], 'fixtures/input.json']) {
      await host.fs.promises.writeFile(`/scenario/${filepath}`, '')
    }
    const config = defineConfig({prompt: 'Implement a feature', checks: [createVitestCheck({...options, files})]})

    const check = await parseCheckConfig(host, '/scenario', config.checks[0])

    expect(check.files).toEqual(
      [options.configPath, ...options.testPaths, ...files].map(relativePath => ({
        filepath: `/scenario/${relativePath}`,
        relativePath,
      })),
    )
  })

  test('rejects nested symlinks in staged directories', async () => {
    const host = VirtualHost.create()
    for (const filepath of [options.configPath, ...options.testPaths]) {
      await host.fs.promises.mkdir(`/scenario/${filepath.slice(0, filepath.lastIndexOf('/') + 1)}`, {recursive: true})
      await host.fs.promises.writeFile(`/scenario/${filepath}`, '')
    }
    await host.fs.promises.mkdir('/scenario/fixtures/nested', {recursive: true})
    await host.fs.promises.mkdir('/scenario-sibling')
    await host.fs.promises.writeFile('/scenario-sibling/secret.json', 'outside scenario')
    await host.fs.promises.symlink('/scenario-sibling/secret.json', '/scenario/fixtures/nested/secret.json')
    const config = defineConfig({
      prompt: 'Implement a feature',
      checks: [createVitestCheck({...options, files: ['fixtures']})],
    })

    await expect(parseCheckConfig(host, '/scenario', config.checks[0])).rejects.toThrow(
      'Check config file directory must not contain a symbolic link: fixtures/nested/secret.json',
    )
  })

  test('accepts an empty list of additional files', () => {
    expect(createVitestCheck({...options, files: []}).files).toEqual([options.configPath, ...options.testPaths])
  })

  test('does not use additional files as Vitest test filters', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(JSON.stringify(createReport()))
    await using sandbox = resource
    const check = createVitestCheck({...options, files: ['helpers/setup.ts', 'fixtures']})

    await check.run({sandbox, logger})

    expect(runCommand.mock.calls[0]).toEqual([
      'npx',
      [
        'vitest',
        'run',
        '--config',
        options.configPath,
        '--reporter=json',
        '--outputFile',
        expect.any(String),
        ...options.testPaths,
      ],
      {allowNonZeroExitCode: true},
    ])
  })

  test('preserves individual names and maps failed and skipped assertions across suites', async () => {
    const {sandbox: resource} = await createSandbox(
      JSON.stringify(createReport(['passed', 'failed', 'pending', 'todo', 'skipped'])),
      1,
    )
    await using sandbox = resource

    await expect(createVitestCheck(options).run({sandbox, logger})).resolves.toEqual({
      outcomes: [
        {type: 'outcome', id: 'suite test 0', status: 'passed'},
        {type: 'outcome', id: 'suite test 1', status: 'failed'},
        {type: 'outcome', id: 'suite test 2', status: 'skipped'},
        {type: 'outcome', id: 'suite test 3', status: 'skipped'},
        {type: 'outcome', id: 'suite test 4', status: 'skipped'},
      ],
    })
  })

  test('rejects unexpected exits even when a valid report exists', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(JSON.stringify(createReport()), 2)
    await using sandbox = resource

    await expect(createVitestCheck(options).run({sandbox, logger})).rejects.toThrow(
      'Vitest failed with exit code 2: runner diagnostics',
    )
    expect(runCommand.mock.calls[1][0]).toBe('rm')
  })

  test('rejects a missing report rather than using stale results from another run', async () => {
    const {sandbox: resource, runCommand} = await createSandbox(undefined)
    await using sandbox = resource
    await sandbox.writeFile('scenario-results.json', JSON.stringify(createReport()))

    await expect(createVitestCheck(options).run({sandbox, logger})).rejects.toThrow('ENOENT')
    expect(runCommand.mock.calls[1][0]).toBe('rm')
  })

  test('rejects suite execution errors even when another suite reports failed assertions', async () => {
    const report = createReport(['failed'])
    report.testResults.push({message: 'Failed to load module', assertionResults: []})
    const {sandbox: resource} = await createSandbox(JSON.stringify(report), 1)
    await using sandbox = resource

    await expect(createVitestCheck(options).run({sandbox, logger})).rejects.toThrow(
      'Vitest did not produce usable test outcomes',
    )
  })

  test.each([
    {name: 'invalid JSON', contents: '{'},
    {name: 'missing suites', contents: JSON.stringify({numTotalTests: 1, numFailedTests: 0})},
    {name: 'missing assertions', contents: JSON.stringify({...createReport(), testResults: [{}]})},
    {
      name: 'invalid name',
      contents: JSON.stringify({
        ...createReport(),
        testResults: [{message: '', assertionResults: [{fullName: 1, status: 'passed'}]}],
      }),
    },
    {name: 'invalid status', contents: JSON.stringify(createReport(['unknown']))},
  ])('rejects malformed reports: $name', async ({contents}) => {
    const {sandbox: resource} = await createSandbox(contents)
    await using sandbox = resource

    await expect(createVitestCheck(options).run({sandbox, logger})).rejects.toThrow(
      'Vitest did not produce a valid test report',
    )
  })

  test.each([
    {name: 'zero tests', report: createReport([]), exitCode: 0},
    {name: 'incomplete assertions', report: {...createReport(), numTotalTests: 2}, exitCode: 0},
    {name: 'inconsistent failure count', report: {...createReport(), numFailedTests: 1}, exitCode: 1},
    {name: 'nonzero exit without failed assertions', report: createReport(), exitCode: 1},
    {name: 'successful exit with failed assertions', report: createReport(['failed']), exitCode: 0},
  ])('rejects unusable outcomes: $name', async ({report, exitCode}) => {
    const {sandbox: resource} = await createSandbox(JSON.stringify(report), exitCode)
    await using sandbox = resource

    await expect(createVitestCheck(options).run({sandbox, logger})).rejects.toThrow(
      'Vitest did not produce usable test outcomes: runner diagnostics',
    )
  })
})
