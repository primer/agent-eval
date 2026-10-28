import fs from 'node:fs/promises'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {expect, test, vi} from 'vitest'
import {logger} from '../logger'
import {VirtualSandbox, type CommandResult} from '../sandbox'
import {loadScenario} from './load'

// Keep source schemas and test sandboxes on the same class identity.
vi.mock('@primer/agent-eval/scenario', async () => {
  return await import('./config')
})

const scenariosDirectory = path.resolve(import.meta.dirname, '../../../../scenarios')
const repositoryDirectory = path.dirname(scenariosDirectory)
const themes = [
  'light',
  'dark',
  'light-tritanopia',
  'light-tritanopia-high-contrast',
  'light-high-contrast',
  'light-colorblind',
  'light-colorblind-high-contrast',
  'dark-colorblind',
  'dark-colorblind-high-contrast',
  'dark-dimmed',
  'dark-dimmed-high-contrast',
  'dark-high-contrast',
  'dark-tritanopia',
  'dark-tritanopia-high-contrast',
]

const cases: Array<{
  id: string
  outcomes: Array<string>
  baselinePassed: Array<string>
}> = [
  {
    id: '000-nextjs-template',
    outcomes: ['src/app/page.tsx example test'],
    baselinePassed: ['src/app/page.tsx example test'],
  },
  ...['000-vite-template', '000-llm-as-a-judge'].map(id => {
    return {
      id,
      outcomes: ['src/App.tsx exports the example app'],
      baselinePassed: ['src/App.tsx exports the example app'],
    }
  }),
  {
    id: '001-agent-uses-button-from-primer',
    outcomes: [
      'src/app/page.tsx imports Primer Button',
      'src/app/page.tsx uses Primer Button',
      'src/app/page.tsx uses primary variant',
      'src/app/page.tsx button has text submit',
    ],
    baselinePassed: [],
  },
  {
    id: '002-agent-uses-octicon-from-primer',
    outcomes: ['src/app/page.tsx imports Primer SearchIcon', 'src/app/page.tsx uses Primer SearchIcon'],
    baselinePassed: [],
  },
  {
    id: '003-agent-uses-form-from-primer',
    outcomes: [
      'src/app/page.tsx imports Primer FormControl',
      'src/app/page.tsx imports Primer TextInput',
      'src/app/page.tsx imports Primer Button',
      'src/app/page.tsx uses a semantic form element',
      'src/app/page.tsx uses Primer FormControl',
      'src/app/page.tsx uses Primer TextInput',
      'src/app/page.tsx uses Primer Button with type submit',
    ],
    baselinePassed: [],
  },
  {
    id: '004-agent-setup-nextjs',
    outcomes: [
      'includes @primer/react',
      'includes @primer/primitives',
      'src/app/layout.tsx imports Primer BaseStyles',
      'src/app/layout.tsx uses Primer BaseStyles',
      'src/app/layout.tsx configures automatic light and dark color modes',
      'src/app/layout.tsx imports the light color mode primitives',
      'src/app/layout.tsx imports the dark color mode primitives',
      'src/app/layout.tsx does not import ThemeProvider',
    ],
    baselinePassed: ['src/app/layout.tsx does not import ThemeProvider'],
  },
  {
    id: '005-agent-enables-theme-switching',
    outcomes: [
      'src/app/layout.tsx imports Primer primitives',
      ...themes.map(theme => {
        return `src/app/layout.tsx imports Primer ${theme} theme primitives`
      }),
      'src/app/layout.tsx sets data-color-mode',
      'src/app/layout.tsx sets data-light-mode',
      'src/app/layout.tsx sets data-dark-mode',
    ],
    baselinePassed: [],
  },
]

const fixturesDirectory = path.resolve(import.meta.dirname, '../fixtures/scenario-checks')

async function runCheck(
  id: string,
  variant: 'baseline' | 'passing' | 'alternate-quoting' | 'missing-source' | 'missing-primary-variant' | 'missing-html',
) {
  const scenario = await loadScenario({directory: path.join(scenariosDirectory, id)})
  expect(scenario.checks).toHaveLength(1)
  expect(
    scenario.checks[0].files.map(file => {
      return file.relativePath
    }),
  ).toEqual(['vitest.config.scenario.ts', 'scenario.test.ts'])

  const directory =
    variant === 'baseline' ? path.join(scenariosDirectory, id) : path.join(fixturesDirectory, variant, id)
  const directoryEntries = await fs.readdir(directory)
  await using sandbox = await VirtualSandbox.create()
  const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async () => {
    const result = await new Promise<CommandResult>((resolve, reject) => {
      execFile(
        process.execPath,
        [
          path.join(repositoryDirectory, 'node_modules/vitest/vitest.mjs'),
          'run',
          '--config',
          path.join(fixturesDirectory, 'vitest.config.ts'),
          '--configLoader',
          'native',
          '--root',
          directory,
        ],
        {
          cwd: repositoryDirectory,
          timeout: 10000,
        },
        (error, stdout, stderr) => {
          if (error) {
            if (typeof error.code !== 'number') {
              reject(error)
              return
            }
            resolve({stdout, stderr, exitCode: error.code})
          } else {
            resolve({stdout, stderr, exitCode: 0})
          }
        },
      )
    })
    expect(await fs.readdir(directory)).toEqual(directoryEntries)
    await sandbox.writeFile('vitest-scenario-report.json', result.stdout)
    return result
  })
  try {
    const groups = await scenario.checks[0].run({logger, sandbox})
    expect(runCommand).toHaveBeenCalledTimes(1)
    expect(runCommand).toHaveBeenCalledWith('npx', ['vitest', 'run', '--config', 'vitest.config.scenario.ts'], {
      allowNonZeroExitCode: true,
    })
    expect(groups).toHaveLength(1)
    const group = groups[0]
    if (group.type !== 'outcomes') {
      throw new Error(`Expected outcomes for scenario ${id}`)
    }
    return {check: scenario.checks[0].name, outcomes: group.outcomes}
  } finally {
    runCommand.mockRestore()
  }
}

test.each(cases)('$id preserves the original outcomes on the untouched fixture', async scenario => {
  const result = await runCheck(scenario.id, 'baseline')
  expect(result.check).toBe('node-tests')
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {type: 'outcome', id, status: scenario.baselinePassed.includes(id) ? 'passed' : 'failed', annotations: []}
    }),
  )
})

test.each(cases)('$id accepts a representative passing implementation', async scenario => {
  const result = await runCheck(scenario.id, 'passing')
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {type: 'outcome', id, status: 'passed', annotations: []}
    }),
  )
})

test.each(cases)('$id preserves support for alternate quoting', async scenario => {
  const result = await runCheck(scenario.id, 'alternate-quoting')
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {type: 'outcome', id, status: 'passed', annotations: []}
    }),
  )
})

test.each(cases)('$id reports missing source files instead of returning passing outcomes', async scenario => {
  await expect(runCheck(scenario.id, 'missing-source')).rejects.toThrow('Vitest failed without reporting failed tests')
})

test('a missing primary variant fails only the corresponding button outcome', async () => {
  const scenario = cases.find(candidate => {
    return candidate.id === '001-agent-uses-button-from-primer'
  })!
  const result = await runCheck(scenario.id, 'missing-primary-variant')
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {
        type: 'outcome',
        id,
        status: id === 'src/app/page.tsx uses primary variant' ? 'failed' : 'passed',
        annotations: [],
      }
    }),
  )
})

test('a missing setup html element remains an individual failed outcome', async () => {
  const scenario = cases.find(candidate => {
    return candidate.id === '004-agent-setup-nextjs'
  })!
  const result = await runCheck(scenario.id, 'missing-html')
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {
        type: 'outcome',
        id,
        status: id === 'src/app/layout.tsx configures automatic light and dark color modes' ? 'failed' : 'passed',
        annotations: [],
      }
    }),
  )
})
