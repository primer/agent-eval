import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, test} from 'vitest'
import type {ExperimentEvalConfig} from '@primer/agent-experiment'
import {resolveExperimentEval, type ResolvedEval} from './eval'

const temporaryDirectories: Array<string> = []

async function createTemporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-eval-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => {
      return fs.rm(directory, {recursive: true, force: true})
    }),
  )
})

describe(resolveExperimentEval, () => {
  test('resolves built-in evals through the provided resolver', async () => {
    const builtinEval: ResolvedEval = {
      id: '001-agent-uses-button-from-primer',
      directory: '/path/to/eval',
      config: {
        prompt: 'Use a Primer button',
      },
      testPath: '/path/to/eval/eval.test.ts',
    }

    await expect(
      resolveExperimentEval('001-agent-uses-button-from-primer' as ExperimentEvalConfig, {
        builtInEvalResolver(id) {
          expect(id).toBe('001-agent-uses-button-from-primer')
          return builtinEval
        },
      }),
    ).resolves.toBe(builtinEval)
  })

  test('resolves inline eval directories relative to the provided cwd', async () => {
    const cwd = await createTemporaryDirectory()
    const directory = path.join(cwd, 'evals', 'local-eval')
    await fs.mkdir(directory, {recursive: true})
    await fs.writeFile(path.join(directory, 'eval.config.mjs'), `export default {prompt: 'Use ignored config'}`)
    await fs.writeFile(path.join(directory, 'eval.config.ts'), `export default {prompt: 'Update the local project'}`)
    await fs.writeFile(path.join(directory, 'eval.test.ts'), '')

    await expect(
      resolveExperimentEval(
        {
          name: 'local-eval',
          path: 'evals/local-eval',
        },
        {
          builtInEvalResolver() {
            throw new Error('Unexpected built-in eval lookup')
          },
          cwd,
        },
      ),
    ).resolves.toEqual({
      id: 'local-eval',
      directory,
      config: {
        prompt: 'Update the local project',
      },
      testPath: path.join(directory, 'eval.test.ts'),
    })
  })

  test('requires inline evals to use the default eval file structure', async () => {
    const cwd = await createTemporaryDirectory()
    const directory = path.join(cwd, 'fixtures', 'local-eval')
    await fs.mkdir(directory, {recursive: true})
    await fs.writeFile(path.join(directory, 'eval.config.ts'), `export default {prompt: 'Use default config'}`)
    await fs.writeFile(path.join(directory, 'custom.test.ts'), '')

    await expect(
      resolveExperimentEval(
        {
          name: 'local-eval',
          path: 'fixtures/local-eval',
        },
        {
          builtInEvalResolver() {
            throw new Error('Unexpected built-in eval lookup')
          },
          cwd,
        },
      ),
    ).rejects.toThrow(`Eval "local-eval" test file was not found: ${path.join(directory, 'eval.test.ts')}`)
  })
})
