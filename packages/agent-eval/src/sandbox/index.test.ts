import {expect, test} from 'vitest'
import {CONTAINER_WORKDIR, DEFAULT_DOCKER_IMAGE, SandboxSchema, SystemSandbox, VirtualSandbox} from './index'

test('exports sandbox implementations, schema, and constants', () => {
  expect(CONTAINER_WORKDIR).toBe('/home/sandbox/workspace')
  expect(DEFAULT_DOCKER_IMAGE).toBe('node:26.5.0-slim')
  expect(SandboxSchema).toBeDefined()
  expect(SystemSandbox).toBeTypeOf('function')
  expect(VirtualSandbox).toBeTypeOf('function')
})
