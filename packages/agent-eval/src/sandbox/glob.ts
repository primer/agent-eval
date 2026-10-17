import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import * as z from 'zod/mini'
import {resolveContainerPath} from './path'
import type {Sandbox, SandboxGlobOptions} from './types'

async function globInContainer(
  sandbox: Pick<Sandbox, 'copy' | 'runCommand'>,
  pattern: string | Array<string>,
  options: SandboxGlobOptions | undefined,
): Promise<Array<string>> {
  await using script = {
    path: `/tmp/agent-eval-glob-${randomUUID()}.mjs`,
    async [Symbol.asyncDispose]() {
      await sandbox.runCommand('rm', ['-f', '--', this.path])
    },
  }
  await sandbox.copy(fileURLToPath(new URL('../../dist/sandbox/glob-script.mjs', import.meta.url)), script.path)

  const cwd = options?.cwd ?? '.'
  const request = {
    pattern,
    options: {
      ...options,
      cwd: resolveContainerPath(
        cwd instanceof URL || cwd.startsWith('file:') ? fileURLToPath(cwd, {windows: false}) : cwd,
      ),
    },
  }
  const result = await sandbox.runCommand('node', [script.path, JSON.stringify(request)])
  return z.array(z.string()).parse(JSON.parse(result.stdout))
}

export {globInContainer}
