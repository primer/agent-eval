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
  solution: Record<string, string>
}> = [
  {
    id: '000-nextjs-template',
    outcomes: ['src/app/page.tsx example test'],
    baselinePassed: ['src/app/page.tsx example test'],
    solution: {
      'src/app/page.tsx': `export default function IndexPage() {
  return <main>Hello world</main>
}`,
    },
  },
  ...['000-vite-template', '000-llm-as-a-judge'].map(id => {
    return {
      id,
      outcomes: ['src/App.tsx exports the example app'],
      baselinePassed: ['src/App.tsx exports the example app'],
      solution: {
        'src/App.tsx': `export function App() {
  return <main><h1>No projects yet</h1><p>Create your first project to get started.</p></main>
}`,
      },
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
    solution: {
      'src/app/page.tsx': `import {Button} from '@primer/react'
export default function IndexPage() {
  return <Button variant="primary">Submit</Button>
}`,
    },
  },
  {
    id: '002-agent-uses-octicon-from-primer',
    outcomes: ['src/app/page.tsx imports Primer SearchIcon', 'src/app/page.tsx uses Primer SearchIcon'],
    baselinePassed: [],
    solution: {
      'src/app/page.tsx': `import {SearchIcon} from '@primer/octicons-react'
export default function IndexPage() {
  return <SearchIcon />
}`,
    },
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
    solution: {
      'src/app/page.tsx': `import {FormControl, TextInput, Button} from '@primer/react'
export default function IndexPage() {
  return (
    <form>
      <FormControl>
        <FormControl.Label>Email</FormControl.Label>
        <TextInput type="email" />
      </FormControl>
      <Button type="submit">Sign up</Button>
    </form>
  )
}`,
    },
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
    solution: {
      'package.json': JSON.stringify({
        dependencies: {'@primer/react': '*'},
        devDependencies: {'@primer/primitives': '*'},
      }),
      'src/app/layout.tsx': `import type {ReactNode} from 'react'
import {BaseStyles} from '@primer/react'
import '@primer/primitives/dist/css/functional/themes/light.css'
import '@primer/primitives/dist/css/functional/themes/dark.css'
export default function Layout({children}: {children: ReactNode}) {
  return (
    <html data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
      <body><BaseStyles>{children}</BaseStyles></body>
    </html>
  )
}`,
    },
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
    solution: {
      'src/app/layout.tsx': `import type {ReactNode} from 'react'
import '@primer/primitives/dist/css/primitives.css'
${themes
  .map(theme => {
    return `import '@primer/primitives/dist/css/functional/themes/${theme}.css'`
  })
  .join('\n')}
export default function Layout({children}: {children: ReactNode}) {
  return (
    <html data-color-mode="auto" data-light-mode="light" data-dark-mode="dark">
      <body>{children}</body>
    </html>
  )
}`,
    },
  },
]

async function runCheck(id: string, files: Record<string, string>) {
  const scenario = await loadScenario({directory: path.join(scenariosDirectory, id)})
  expect(scenario.checks).toHaveLength(1)
  expect(
    scenario.checks[0].files.map(file => {
      return file.relativePath
    }),
  ).toEqual(['vitest.config.scenario.ts', 'scenario.test.ts'])

  const temporaryDirectory = path.join(repositoryDirectory, '.agents/tmp')
  await fs.mkdir(temporaryDirectory, {recursive: true})
  const directory = await fs.mkdtemp(path.join(temporaryDirectory, 'scenario-check-'))
  try {
    await fs.symlink(path.join(repositoryDirectory, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
    for (const file of scenario.checks[0].files) {
      await fs.copyFile(file.filepath, path.join(directory, file.relativePath))
    }
    for (const [filepath, contents] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(directory, filepath)), {recursive: true})
      await fs.writeFile(path.join(directory, filepath), contents)
    }

    await using sandbox = await VirtualSandbox.create()
    const runCommand = vi.spyOn(sandbox, 'runCommand').mockImplementation(async () => {
      const result = await new Promise<CommandResult>((resolve, reject) => {
        execFile(
          process.execPath,
          [
            path.join(repositoryDirectory, 'node_modules/vitest/vitest.mjs'),
            'run',
            '--config',
            'vitest.config.scenario.ts',
          ],
          {cwd: directory, timeout: 10000},
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
      await sandbox.writeFile(
        'vitest-scenario-report.json',
        await fs.readFile(path.join(directory, 'vitest-scenario-report.json'), 'utf8'),
      )
      return result
    })
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
    await fs.rm(directory, {recursive: true, force: true})
  }
}

test.each(cases)('$id preserves the original outcomes on the untouched fixture', async scenario => {
  const files = Object.fromEntries(
    await Promise.all(
      Object.keys(scenario.solution).map(async filepath => {
        return [filepath, await fs.readFile(path.join(scenariosDirectory, scenario.id, filepath), 'utf8')]
      }),
    ),
  )
  const result = await runCheck(scenario.id, files)
  expect(result.check).toBe('node-tests')
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {type: 'outcome', id, status: scenario.baselinePassed.includes(id) ? 'passed' : 'failed'}
    }),
  )
})

test.each(cases)('$id accepts a representative passing implementation', async scenario => {
  const result = await runCheck(scenario.id, scenario.solution)
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {type: 'outcome', id, status: 'passed'}
    }),
  )
})

test.each(cases)('$id preserves support for alternate quoting', async scenario => {
  const files = Object.fromEntries(
    Object.entries(scenario.solution).map(([filepath, contents]) => {
      return [filepath, filepath.endsWith('.json') ? contents : contents.replace(/'([^']*)'/g, '"$1"')]
    }),
  )
  const result = await runCheck(scenario.id, files)
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {type: 'outcome', id, status: 'passed'}
    }),
  )
})

test.each(cases)('$id reports missing source files instead of returning passing outcomes', async scenario => {
  await expect(runCheck(scenario.id, {})).rejects.toThrow('Vitest failed without reporting failed tests')
})

test('a missing primary variant fails only the corresponding button outcome', async () => {
  const scenario = cases.find(candidate => {
    return candidate.id === '001-agent-uses-button-from-primer'
  })!
  const result = await runCheck(scenario.id, {
    'src/app/page.tsx': scenario.solution['src/app/page.tsx'].replace(' variant="primary"', ''),
  })
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {type: 'outcome', id, status: id === 'src/app/page.tsx uses primary variant' ? 'failed' : 'passed'}
    }),
  )
})

test('a missing setup html element remains an individual failed outcome', async () => {
  const scenario = cases.find(candidate => {
    return candidate.id === '004-agent-setup-nextjs'
  })!
  const result = await runCheck(scenario.id, {
    ...scenario.solution,
    'src/app/layout.tsx': scenario.solution['src/app/layout.tsx']
      .replace(/<html[^>]*>/, '<div>')
      .replace('</html>', '</div>'),
  })
  expect(result.outcomes).toEqual(
    scenario.outcomes.map(id => {
      return {
        type: 'outcome',
        id,
        status: id === 'src/app/layout.tsx configures automatic light and dark color modes' ? 'failed' : 'passed',
      }
    }),
  )
})
