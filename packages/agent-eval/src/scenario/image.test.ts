import {expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {buildScenarioImage} from './image'
import {loadScenario} from './load'

test('builds default scenario images without private evaluation files or host dependencies', async () => {
  const host = VirtualHost.create({
    '/scenario/package.json': '{}',
    '/scenario/src/index.js': 'source',
    '/scenario/reference.txt': 'private judge reference',
    '/scenario/scenario.config.ts': '',
    '/scenario/node_modules/local.js': 'host dependency',
    '/scenario/checks/private.txt': 'private check reference',
  })
  vi.spyOn(host, 'loadModule').mockResolvedValue({
    default: {
      prompt: 'Update the project',
      checks: [
        {
          name: 'check',
          files: ['checks/private.txt'],
          async run() {
            return {outcomes: []}
          },
        },
      ],
      judges: [
        {
          name: 'judge',
          files: ['reference.txt'],
          scores: [
            {value: 0, description: 'Missing'},
            {value: 1, description: 'Present'},
          ],
        },
      ],
    },
  })
  const scenario = await loadScenario({host, directory: '/scenario'})
  const build = vi.spyOn(host, 'buildSandboxImage')
  const image = await buildScenarioImage({scenario, host, dockerImage: 'custom-base:latest'})

  expect(build).toHaveBeenCalledWith({
    dockerImage: 'custom-base:latest',
    scenario: {
      directory: '/scenario',
      exclude: expect.arrayContaining(['scenario.config.ts', 'node_modules', 'checks/private.txt', 'reference.txt']),
    },
  })
  await using sandbox = await host.createSandbox({preparedImage: image})
  await expect(sandbox.readFile('src/index.js')).resolves.toBe('source')
  for (const filename of ['scenario.config.ts', 'node_modules/local.js', 'checks/private.txt', 'reference.txt']) {
    await expect(sandbox.exists(filename)).resolves.toBe(false)
  }
})
