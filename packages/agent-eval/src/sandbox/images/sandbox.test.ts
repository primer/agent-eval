import {expect, test, vi} from 'vitest'
import {buildImageFromDockerfile} from '../../docker'
import {getSandboxImageBuild} from './sandbox'

vi.mock('../../docker', async importOriginal => {
  const original = await importOriginal<typeof import('../../docker')>()
  return {
    ...original,
    buildImageFromDockerfile: vi.fn<typeof original.buildImageFromDockerfile>(async (_dockerfile, options) => {
      return {tagName: options.t}
    }),
  }
})

vi.mock('./tools', () => {
  return {
    getToolsImageBuild: vi.fn(async () => {
      return {tagName: 'agent-eval/tools:test'}
    }),
  }
})

test('augments custom images with walkthrough tools, a writable workspace, and the npm executable path', async () => {
  await getSandboxImageBuild({baseImage: 'node:26-slim'})

  expect(buildImageFromDockerfile).toHaveBeenCalledOnce()
  const [dockerfile, options] = vi.mocked(buildImageFromDockerfile).mock.calls[0]!
  expect(options.buildargs).toEqual({
    BASE_IMAGE: 'node:26-slim',
    TOOLS_IMAGE: 'agent-eval/tools:test',
  })
  expect(dockerfile).toMatch(/apt-get install[^\n]*\bchromium\b/)
  expect(dockerfile).toMatch(/apt-get install[^\n]*\bgit\b/)
  expect(dockerfile).toMatch(/chown -R node:node\s*\\\n\s*\/home\/sandbox/)
  expect(dockerfile).toContain('npm config set prefix /home/node/.npm-global')
  expect(dockerfile).toContain('ENV PATH="/home/node/.npm-global/bin:${PATH}"')
})
