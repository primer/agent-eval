import Docker from 'dockerode'
import {beforeEach, describe, expect, test, vi} from 'vitest'
import {VirtualHost} from '../host'
import {MCP_CONFIG_PATH, NODE_USER, SKILLS_DIR} from './constants'
import {SandboxSchema, SystemSandbox} from './system'
import {VirtualSandbox} from './virtual'

function createSandbox() {
  const container = {
    stop: vi.fn(),
  }
  // @ts-expect-error This test only exercises methods whose container operations are mocked.
  return new SystemSandbox(VirtualHost.create(), new Docker(), container)
}

describe('SandboxSchema', () => {
  test('accepts system and virtual sandboxes', async () => {
    const systemSandbox = createSandbox()
    const virtualSandbox = await VirtualSandbox.create()

    expect(SandboxSchema.parse(systemSandbox)).toBe(systemSandbox)
    expect(SandboxSchema.parse(virtualSandbox)).toBe(virtualSandbox)
    expect(() => {
      SandboxSchema.parse({})
    }).toThrow()
  })
})

describe('SystemSandbox configuration helpers', () => {
  let sandbox: SystemSandbox

  beforeEach(() => {
    sandbox = createSandbox()
    vi.spyOn(sandbox, 'runCommand').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    })
    vi.spyOn(sandbox, 'writeFile').mockResolvedValue()
    vi.spyOn(sandbox, 'copy').mockResolvedValue()
  })

  test('appends agent instructions with normalized newlines', async () => {
    vi.spyOn(sandbox, 'exists').mockResolvedValue(true)
    vi.spyOn(sandbox, 'readFile').mockResolvedValue('Existing instructions')

    await sandbox.addAgentInstruction('New instructions')

    expect(sandbox.writeFile).toHaveBeenCalledWith(
      '/home/sandbox/workspace/AGENTS.md',
      'Existing instructions\nNew instructions\n',
    )
  })

  test('creates an agent skill and supporting files', async () => {
    vi.spyOn(sandbox, 'exists').mockResolvedValue(false)

    await sandbox.addAgentSkill('example-skill', 'Example description', 'Skill instructions', {
      files: [
        {
          path: 'references/example.md',
          content: 'reference',
        },
        {
          sourcePath: '/fixtures/script.js',
          destinationPath: 'scripts/script.js',
        },
      ],
    })

    expect(sandbox.writeFile).toHaveBeenCalledWith(
      `${SKILLS_DIR}/example-skill/SKILL.md`,
      `---
name: "example-skill"
description: "Example description"
---

Skill instructions
`,
    )
    expect(sandbox.writeFile).toHaveBeenCalledWith(`${SKILLS_DIR}/example-skill/references/example.md`, 'reference')
    expect(sandbox.copy).toHaveBeenCalledWith('/fixtures/script.js', `${SKILLS_DIR}/example-skill/scripts/script.js`)
  })

  test('rejects invalid skill names and file destinations', async () => {
    vi.spyOn(sandbox, 'exists').mockResolvedValue(false)

    await expect(sandbox.addAgentSkill('Invalid Skill', 'description', 'contents')).rejects.toThrow(
      'Skill names must be lowercase and use hyphens for spaces',
    )
    await expect(
      sandbox.addAgentSkill('valid-skill', 'description', 'contents', {
        files: [
          {
            path: '../outside.md',
            content: 'outside',
          },
        ],
      }),
    ).rejects.toThrow('Invalid agent skill file destination "../outside.md"')
  })

  test('creates a custom agent with tools', async () => {
    vi.spyOn(sandbox, 'exists').mockResolvedValue(false)

    await sandbox.addCustomAgent('example-agent', 'Example description', 'Agent instructions', {
      tools: ['view', 'grep'],
    })

    expect(sandbox.writeFile).toHaveBeenCalledWith(
      '/home/node/.copilot/agents/example-agent.agent.md',
      `---
name: "example-agent"
description: "Example description"
tools: ["view","grep"]
---

Agent instructions
`,
    )
  })

  test('adds an MCP server to the existing configuration', async () => {
    vi.spyOn(sandbox, 'readFile').mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          existing: {
            command: 'existing-server',
            type: 'local',
          },
        },
      }),
    )

    await sandbox.addMcpServer('example', {
      command: 'example-server',
      type: 'local',
    })

    expect(sandbox.writeFile).toHaveBeenCalledWith(
      MCP_CONFIG_PATH,
      JSON.stringify(
        {
          mcpServers: {
            existing: {
              command: 'existing-server',
              type: 'local',
            },
            example: {
              command: 'example-server',
              type: 'local',
            },
          },
        },
        null,
        2,
      ),
    )
    expect(sandbox.runCommand).toHaveBeenCalledWith('chown', ['-R', NODE_USER, MCP_CONFIG_PATH], {
      user: 'root',
    })
  })

  test('rejects duplicate MCP server names', async () => {
    vi.spyOn(sandbox, 'readFile').mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          example: {
            command: 'example-server',
            type: 'local',
          },
        },
      }),
    )

    await expect(
      sandbox.addMcpServer('example', {
        command: 'other-server',
        type: 'local',
      }),
    ).rejects.toThrow('MCP server with name "example" already exists')
  })

  test('installs remote, local, and marketplace plugins', async () => {
    await sandbox.addCopilotPlugin({
      type: 'remote',
      url: 'https://example.com/plugin.git',
      version: 'v1',
    })
    await sandbox.addCopilotPlugin({
      type: 'local',
      sourcePath: '/fixtures/plugin',
    })
    await sandbox.addCopilotPlugin({
      type: 'marketplace',
      name: 'example-plugin',
      marketplace: {
        name: 'example-marketplace',
        source: {
          type: 'remote',
          url: 'https://example.com/marketplace.git',
        },
      },
    })

    expect(sandbox.runCommand).toHaveBeenCalledWith('copilot', [
      'plugin',
      'install',
      'https://example.com/plugin.git#v1',
    ])
    expect(sandbox.copy).toHaveBeenCalledWith(
      '/fixtures/plugin',
      expect.stringMatching(/^\/home\/node\/\.copilot\/plugin-sources\/.+/),
    )
    expect(sandbox.runCommand).toHaveBeenCalledWith('copilot', [
      'plugin',
      'marketplace',
      'add',
      'https://example.com/marketplace.git',
    ])
    expect(sandbox.runCommand).toHaveBeenCalledWith('copilot', [
      'plugin',
      'install',
      'example-plugin@example-marketplace',
    ])
  })
})
