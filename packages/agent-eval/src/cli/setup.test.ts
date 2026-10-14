import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {setupInstructions} from './setup'

const snippet =
  '<!-- BEGIN:agent-eval -->\n## agent-eval\n\nWhen working with agent-eval, first read `node_modules/@primer/agent-eval/docs/AGENTS.md`.\n<!-- END:agent-eval -->\n'

test.each(['AGENTS.md', '.github/copilot-instructions.md', 'copilot-instructions.md'])(
  'appends guidance to existing %s without replacing instructions',
  async filename => {
    const filepath = `/project/${filename}`
    const host = VirtualHost.create({[filepath]: '# Project\n\nExisting instructions.'})

    const result = await setupInstructions(host, '/project')

    expect(result).toEqual({filepath, updated: true})
    expect(await host.fs.promises.readFile(filepath, 'utf-8')).toBe(`# Project\n\nExisting instructions.\n\n${snippet}`)
    if (filename !== 'AGENTS.md') {
      expect(host.fs.existsSync('/project/AGENTS.md')).toBe(false)
    }
  },
)

test('prefers AGENTS.md when both instruction formats exist', async () => {
  const host = VirtualHost.create({
    '/project/AGENTS.md': '# Project\n',
    '/project/.github/copilot-instructions.md': '# Copilot\n',
  })

  await setupInstructions(host, '/project')

  expect(await host.fs.promises.readFile('/project/AGENTS.md', 'utf-8')).toBe(`# Project\n\n${snippet}`)
  expect(await host.fs.promises.readFile('/project/.github/copilot-instructions.md', 'utf-8')).toBe('# Copilot\n')
})

test('prefers the GitHub Copilot instructions over a root Copilot file', async () => {
  const host = VirtualHost.create({
    '/project/.github/copilot-instructions.md': '# Copilot\n',
    '/project/copilot-instructions.md': '# Other\n',
  })

  const result = await setupInstructions(host, '/project')

  expect(result.filepath).toBe('/project/.github/copilot-instructions.md')
  expect(await host.fs.promises.readFile('/project/copilot-instructions.md', 'utf-8')).toBe('# Other\n')
})

test('creates AGENTS.md when no instruction file exists', async () => {
  const host = VirtualHost.create({'/project': {}})

  const result = await setupInstructions(host, '/project')

  expect(result).toEqual({filepath: '/project/AGENTS.md', updated: true})
  expect(await host.fs.promises.readFile(result.filepath, 'utf-8')).toBe(snippet)
})

test.each(['', '# Project\n', '# Project\n\n', '# Project\r\n'])(
  'separates the snippet and preserves line endings for %j',
  async contents => {
    const host = VirtualHost.create({'/project/AGENTS.md': contents})

    await setupInstructions(host, '/project')

    const expected =
      contents === ''
        ? snippet
        : contents.includes('\r\n')
          ? `# Project\r\n\r\n${snippet.replaceAll('\n', '\r\n')}`
          : `# Project\n\n${snippet}`
    expect(await host.fs.promises.readFile('/project/AGENTS.md', 'utf-8')).toBe(expected)
  },
)

test('does not duplicate instructions on repeated setup', async () => {
  const host = VirtualHost.create({'/project/AGENTS.md': '# Project'})
  await setupInstructions(host, '/project')
  const contents = await host.fs.promises.readFile('/project/AGENTS.md', 'utf-8')

  const result = await setupInstructions(host, '/project')

  expect(result.updated).toBe(false)
  expect(await host.fs.promises.readFile('/project/AGENTS.md', 'utf-8')).toBe(contents)
})

test('recognizes the previously recommended instruction without a heading', async () => {
  const contents = '> When working with agent-eval, first read `node_modules/@primer/agent-eval/docs/AGENTS.md`.\n'
  const host = VirtualHost.create({'/project/AGENTS.md': contents})

  const result = await setupInstructions(host, '/project')

  expect(result.updated).toBe(false)
  expect(await host.fs.promises.readFile('/project/AGENTS.md', 'utf-8')).toBe(contents)
})

test.each(['\n', '\r\n'])(
  'replaces an outdated managed block and preserves surrounding content with %j',
  async newline => {
    const before = `# Project${newline}${newline}Keep these instructions.${newline}${newline}`
    const after = `${newline}${newline}## Other tools${newline}Keep these too.`
    const oldBlock =
      `<!-- BEGIN:agent-eval -->${newline}## agent-eval${newline}${newline}` +
      `When working with agent-eval, first read \`node_modules/@primer/agent-eval/docs/AGENTS.md\`.${newline}` +
      `Outdated instructions to remove.${newline}<!-- END:agent-eval -->`
    const host = VirtualHost.create({'/project/AGENTS.md': before + oldBlock + after})

    const result = await setupInstructions(host, '/project')

    expect(result).toEqual({filepath: '/project/AGENTS.md', updated: true})
    expect(await host.fs.promises.readFile(result.filepath, 'utf-8')).toBe(
      before + snippet.trimEnd().replaceAll('\n', newline) + after,
    )
  },
)

test('replaces a managed block without the current instruction', async () => {
  const host = VirtualHost.create({
    '/project/AGENTS.md': '<!-- BEGIN:agent-eval -->\nOld guidance\n<!-- END:agent-eval -->',
  })

  const result = await setupInstructions(host, '/project')

  expect(result.updated).toBe(true)
  expect(await host.fs.promises.readFile(result.filepath, 'utf-8')).toBe(snippet.trimEnd())
})

test.each([
  '<!-- BEGIN:agent-eval -->\nDo not remove this.',
  'Do not remove this.\n<!-- END:agent-eval -->',
  '<!-- END:agent-eval -->\nDo not remove this.\n<!-- BEGIN:agent-eval -->',
  '<!-- BEGIN:agent-eval -->\n<!-- BEGIN:agent-eval -->\n<!-- END:agent-eval -->',
  '<!-- BEGIN:agent-eval -->\n<!-- END:agent-eval -->\n<!-- END:agent-eval -->',
])('rejects malformed markers without modifying instructions: %j', async contents => {
  const host = VirtualHost.create({'/project/AGENTS.md': contents})

  await expect(setupInstructions(host, '/project')).rejects.toThrow('Invalid agent-eval comment markers')

  expect(await host.fs.promises.readFile('/project/AGENTS.md', 'utf-8')).toBe(contents)
})

test('propagates unreadable instruction files instead of falling back', async () => {
  const host = VirtualHost.create({
    '/project/AGENTS.md': {},
    '/project/.github/copilot-instructions.md': '# Copilot\n',
  })

  await expect(setupInstructions(host, '/project')).rejects.toThrow(/EISDIR/)
  expect(await host.fs.promises.readFile('/project/.github/copilot-instructions.md', 'utf-8')).toBe('# Copilot\n')
})
