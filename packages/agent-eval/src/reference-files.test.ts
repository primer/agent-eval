import {describe, expect, test} from 'vitest'
import {parseCheckConfig} from './check'
import {VirtualHost} from './host'
import {parseJudgeConfig} from './judge'

function referenceConfig(filepath: string) {
  return {
    name: 'reference',
    files: [filepath],
    scores: [{value: 1, description: 'Meets the criteria'}],
    async run() {
      return {outcomes: []}
    },
  }
}

function createHost() {
  return VirtualHost.create({
    '/scenario/references/file.json': 'reference',
    '/scenario-sibling/file.json': 'outside',
  })
}

describe.each([
  ['check', parseCheckConfig],
  ['judge', parseJudgeConfig],
] as const)('%s reference containment', (_kind, parseConfig) => {
  test.each(['../scenario-sibling/file.json', '/scenario-sibling/file.json'])(
    'rejects a sibling-prefix escape: %s',
    async filepath => {
      await expect(parseConfig(createHost(), '/scenario', referenceConfig(filepath))).rejects.toThrow(
        'file path must be inside the scenario directory',
      )
    },
  )

  test('rejects a parent symlink pointing outside the scenario', async () => {
    const host = createHost()
    await host.fs.symlink('/scenario-sibling', '/scenario/references/linked')

    await expect(parseConfig(host, '/scenario', referenceConfig('references/linked/file.json'))).rejects.toThrow(
      'file path must be inside the scenario directory',
    )
  })

  test.each(['/scenario/references/file.json', '/scenario-sibling/file.json'])(
    'rejects a final-component symlink to %s',
    async target => {
      const host = createHost()
      await host.fs.symlink(target, '/scenario/link.json')

      await expect(parseConfig(host, '/scenario', referenceConfig('link.json'))).rejects.toThrow(
        'file path must not be a symbolic link',
      )
    },
  )

  test.each(['references/file.json', '/scenario/references/file.json'])(
    'preserves relative destinations for valid references: %s',
    async filepath => {
      const parsed = await parseConfig(createHost(), '/scenario', referenceConfig(filepath))
      expect(parsed.files).toEqual([{filepath: '/scenario/references/file.json', relativePath: 'references/file.json'}])
    },
  )

  test('allows contained parent symlinks without changing the destination path', async () => {
    const host = createHost()
    await host.fs.symlink('/scenario/references', '/scenario/linked')

    const parsed = await parseConfig(host, '/scenario', referenceConfig('linked/file.json'))

    expect(parsed.files).toEqual([{filepath: '/scenario/linked/file.json', relativePath: 'linked/file.json'}])
  })

  test('allows a symlinked scenario root', async () => {
    const host = createHost()
    await host.fs.symlink('/scenario', '/scenario-alias')

    const parsed = await parseConfig(host, '/scenario-alias', referenceConfig('references/file.json'))

    expect(parsed.files).toEqual([
      {filepath: '/scenario-alias/references/file.json', relativePath: 'references/file.json'},
    ])
  })

  test('reports missing reference files', async () => {
    await expect(parseConfig(createHost(), '/scenario', referenceConfig('missing.json'))).rejects.toThrow(
      'config file does not exist: missing.json',
    )
  })
})
