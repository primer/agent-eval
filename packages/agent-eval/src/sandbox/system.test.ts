import Docker from 'dockerode'
import {beforeEach, describe, expect, test, vi} from 'vitest'
import tarStream from 'tar-stream'
import {VirtualHost} from '../host'
import {MCP_CONFIG_PATH, NODE_USER, SKILLS_DIR} from './constants'
import {
  buildDockerImage,
  cleanupActiveContainers,
  createContainer,
  getDockerImageName,
  resolvePreparedImage,
  SandboxSchema,
  SystemSandbox,
} from './system'
import {VirtualSandbox} from './virtual'

function createSandbox(container = {remove: vi.fn().mockResolvedValue(undefined)}) {
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

describe('SystemSandbox lifecycle', () => {
  test('builds the local sandbox image', async () => {
    const stream = {}
    const inspect = vi.fn().mockResolvedValue({})
    const docker = {
      buildImage: vi.fn().mockResolvedValue(stream),
      getImage: vi.fn().mockReturnValue({inspect}),
      modem: {
        followProgress: vi.fn((_stream: unknown, onFinished: (error: Error | null) => void) => {
          onFinished(null)
        }),
      },
    }

    // @ts-expect-error This test only exercises the Docker methods used to build the image.
    const image = await buildDockerImage(docker, 'custom-node:local')

    expect(docker.buildImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        buildargs: {
          BASE_IMAGE: 'custom-node:local',
          COPILOT_CLI_VERSION: '1.0.83',
          NPM_VERSION: '12.0.2',
        },
        dockerfile: 'Dockerfile',
        t: expect.stringMatching(/^agent-eval-sandbox:[a-f0-9]{16}$/),
        target: 'sandbox',
        version: '1',
      }),
    )
    expect(docker.modem.followProgress).toHaveBeenCalledWith(stream, expect.any(Function), expect.any(Function))
    expect(docker.getImage).toHaveBeenCalledWith(image)
    expect(inspect).toHaveBeenCalledOnce()
    expect(image).toMatch(/^agent-eval-sandbox:[a-f0-9]{16}$/)
  })

  test('tags the BuildKit image ID when the requested tag is missing', async () => {
    const stream = {}
    const tag = vi.fn().mockResolvedValue(undefined)
    const inspectTag = vi.fn().mockRejectedValueOnce(new Error('No such image')).mockResolvedValueOnce({})
    const docker = {
      buildImage: vi.fn().mockResolvedValue(stream),
      getImage: vi.fn((image: string) => {
        return image.startsWith('sha256:') ? {tag} : {inspect: inspectTag}
      }),
      modem: {
        followProgress: vi.fn(
          (
            _stream: unknown,
            onFinished: (error: Error | null) => void,
            onProgress: (event: {aux: {ID: string}}) => void,
          ) => {
            onProgress({aux: {ID: `sha256:${'a'.repeat(64)}`}})
            onFinished(null)
          },
        ),
      },
    }

    // @ts-expect-error This test only exercises the Docker methods used to build the image.
    const image = await buildDockerImage(docker, 'custom-node:local')

    expect(tag).toHaveBeenCalledWith({
      repo: 'agent-eval-sandbox',
      tag: image.slice('agent-eval-sandbox:'.length),
    })
    expect(inspectTag).toHaveBeenCalledTimes(2)
  })

  test('fails clearly when the build creates neither the requested tag nor an image ID', async () => {
    const stream = {}
    const inspect = vi.fn().mockRejectedValue(new Error('No such image'))
    const docker = {
      buildImage: vi.fn().mockResolvedValue(stream),
      getImage: vi.fn().mockReturnValue({inspect}),
      modem: {
        followProgress: vi.fn((_stream: unknown, onFinished: (error: Error | null) => void) => {
          onFinished(null)
        }),
      },
    }

    // @ts-expect-error This test only exercises the Docker methods used to build the image.
    await expect(buildDockerImage(docker, 'custom-node:local')).rejects.toThrow(
      /^Docker build completed without creating image tag: agent-eval-sandbox:[a-f0-9]{16}$/,
    )
  })

  test('includes the Dockerfile contents in the local image tag', () => {
    const firstImage = getDockerImageName('custom-node:local', 'FROM custom-node:local\nRUN echo first')
    const secondImage = getDockerImageName('custom-node:local', 'FROM custom-node:local\nRUN echo second')

    expect(firstImage).not.toBe(secondImage)
  })

  test('force removes the container when disposed', async () => {
    const container = {
      remove: vi.fn().mockResolvedValue(undefined),
    }
    const sandbox = createSandbox(container)

    await sandbox[Symbol.asyncDispose]()

    expect(container.remove).toHaveBeenCalledWith({force: true})
  })

  test('force removes the container when initialization fails', async () => {
    const initializationError = new Error('Failed to start container')
    const container = {
      start: vi.fn().mockRejectedValue(initializationError),
      remove: vi.fn(),
    }
    const docker = {
      createContainer: vi.fn().mockResolvedValue(container),
    }

    // @ts-expect-error This test only exercises the Docker methods used before container initialization.
    await expect(createContainer(docker, 'test-image')).rejects.toBe(initializationError)
    expect(container.remove).toHaveBeenCalledWith({force: true})
  })

  test('hardens containers created from prepared images', async () => {
    const container = {
      start: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    const docker = {
      createContainer: vi.fn().mockResolvedValue(container),
    }

    // @ts-expect-error This test only exercises the Docker methods used to create the container.
    const initializedContainer = await createContainer(docker, `sha256:${'a'.repeat(64)}`, {
      hardened: true,
      network: 'agent-eval-pilot',
    })

    expect(docker.createContainer).toHaveBeenCalledWith({
      Image: `sha256:${'a'.repeat(64)}`,
      Cmd: ['sleep', 'infinity'],
      WorkingDir: '/home/sandbox/workspace',
      Tty: true,
      HostConfig: {
        AutoRemove: true,
        CapAdd: ['CHOWN'],
        CapDrop: ['ALL'],
        Memory: 4 * 1024 * 1024 * 1024,
        NetworkMode: 'agent-eval-pilot',
        PidsLimit: 512,
        SecurityOpt: ['no-new-privileges'],
      },
    })

    const sandbox = new SystemSandbox(VirtualHost.create(), new Docker(), initializedContainer)
    await sandbox[Symbol.asyncDispose]()
  })

  test('does not set a network mode for default containers', async () => {
    const container = {
      start: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    const docker = {
      createContainer: vi.fn().mockResolvedValue(container),
    }

    // @ts-expect-error This test only exercises the Docker methods used to create the container.
    const initializedContainer = await createContainer(docker, 'test-image')

    expect(docker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: {
          AutoRemove: true,
        },
      }),
    )

    const sandbox = new SystemSandbox(VirtualHost.create(), new Docker(), initializedContainer)
    await sandbox[Symbol.asyncDispose]()
  })

  test('removes active containers when the process is terminated', async () => {
    const container = {
      start: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    const docker = {
      createContainer: vi.fn().mockResolvedValue(container),
    }
    const once = vi.spyOn(process, 'once')
    const off = vi.spyOn(process, 'off')

    // @ts-expect-error This test only exercises the Docker methods used to create and remove the container.
    const initializedContainer = await createContainer(docker, 'test-image')

    expect(once).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(once).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

    await cleanupActiveContainers()

    expect(container.remove).toHaveBeenCalledWith({force: true})
    expect(off).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(off).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

    const sandbox = new SystemSandbox(VirtualHost.create(), new Docker(), initializedContainer)
    await sandbox[Symbol.asyncDispose]()

    expect(container.remove).toHaveBeenCalledTimes(1)
  })

  describe('prepared images', () => {
    test('requires network configuration to use a prepared image', async () => {
      await expect(
        SystemSandbox.create({
          network: 'agent-eval-pilot',
        }),
      ).rejects.toThrow('network requires preparedImage')
    })

    test('rejects an empty network name', async () => {
      await expect(
        SystemSandbox.create({
          network: '   ',
          preparedImage: `sha256:${'a'.repeat(64)}`,
        }),
      ).rejects.toThrow('network must not be empty')
    })

    test.each([`sha256:${'a'.repeat(64)}`, `example.test/agent-eval/runtime@sha256:${'b'.repeat(64)}`])(
      'resolves existing immutable image %s without building',
      async image => {
        const inspect = vi.fn().mockResolvedValue({
          Id: `sha256:${'c'.repeat(64)}`,
        })
        const docker = {
          buildImage: vi.fn(),
          getImage: vi.fn().mockReturnValue({
            inspect,
          }),
        }

        // @ts-expect-error This test only exercises local image resolution.
        await expect(resolvePreparedImage(docker, image)).resolves.toBe(image)
        expect(docker.getImage).toHaveBeenCalledWith(image)
        expect(inspect).toHaveBeenCalledOnce()
        expect(docker.buildImage).not.toHaveBeenCalled()
      },
    )

    test.each([
      '',
      '   ',
      'node:26.5.0',
      'example.test/agent-eval/runtime:stable',
      `example.test/agent-eval/runtime:stable@sha256:${'a'.repeat(64)}`,
      'sha256:not-a-digest',
    ])('rejects mutable or invalid prepared image reference %s', async image => {
      const docker = {
        getImage: vi.fn(),
      }

      // @ts-expect-error This test only exercises prepared image validation.
      await expect(resolvePreparedImage(docker, image)).rejects.toThrow(/preparedImage/)
      expect(docker.getImage).not.toHaveBeenCalled()
    })

    test('fails when the prepared image does not exist locally', async () => {
      const image = `sha256:${'a'.repeat(64)}`
      const docker = {
        getImage: vi.fn().mockReturnValue({
          inspect: vi.fn().mockRejectedValue(new Error('missing')),
        }),
      }

      // @ts-expect-error This test only exercises local image resolution.
      await expect(resolvePreparedImage(docker, image)).rejects.toThrow(
        `Prepared image does not exist locally: ${image}`,
      )
    })
  })

  test('untracks containers that Docker already removed', async () => {
    const notFoundError = Object.assign(new Error('No such container'), {statusCode: 404})
    const container = {
      start: vi.fn(),
      remove: vi.fn().mockRejectedValue(notFoundError),
    }
    const docker = {
      createContainer: vi.fn().mockResolvedValue(container),
    }
    const off = vi.spyOn(process, 'off')

    // @ts-expect-error This test only exercises the Docker methods used to create and remove the container.
    const initializedContainer = await createContainer(docker, 'test-image')
    const sandbox = new SystemSandbox(VirtualHost.create(), new Docker(), initializedContainer)

    await expect(sandbox[Symbol.asyncDispose]()).resolves.toBeUndefined()

    expect(off).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(off).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
    await expect(cleanupActiveContainers()).resolves.toBeUndefined()
  })

  test('transforms downloaded file contents before writing them to the host', async () => {
    const token = Buffer.from('secret-token')
    const binary = Buffer.from([0, 255, 1, 254])
    const archive = tarStream.pack()
    archive.entry({name: 'workspace', type: 'directory'})
    archive.entry({name: 'workspace/secret.txt'}, Buffer.from('before secret-token after'))
    archive.entry({name: 'workspace/binary.bin'}, binary)
    archive.finalize()

    const host = VirtualHost.create()
    const container = {
      getArchive: vi.fn().mockResolvedValue(archive),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    // @ts-expect-error This test only exercises the container archive download.
    const sandbox = new SystemSandbox(host, new Docker(), container)
    const writeFile = vi.spyOn(host.fs, 'writeFile')

    await sandbox.download('/home/sandbox/workspace', '/download', {
      transform(contents) {
        const match = contents.indexOf(token)
        if (match === -1) {
          return contents
        }
        return Buffer.concat([
          contents.subarray(0, match),
          Buffer.from('[REDACTED]'),
          contents.subarray(match + token.length),
        ])
      },
    })

    const downloadWrites = writeFile.mock.calls.filter(([filepath]) => {
      return typeof filepath === 'string' && filepath.startsWith('/download/')
    })
    expect(downloadWrites).toHaveLength(2)
    for (const [, contents] of downloadWrites) {
      expect(Buffer.from(contents as Buffer).includes(token)).toBe(false)
    }
    await expect(host.fs.readFile('/download/secret.txt', 'utf8')).resolves.toBe('before [REDACTED] after')
    await expect(host.fs.readFile('/download/binary.bin')).resolves.toEqual(binary)
  })

  test('refuses archive symlinks that escape the destination', async () => {
    const archive = tarStream.pack()
    archive.entry({name: 'workspace', type: 'directory'})
    archive.entry({name: 'workspace/escape', type: 'symlink', linkname: '/outside'})
    archive.entry({name: 'workspace/escape/secret.txt'}, 'must not escape')
    archive.finalize()
    const host = VirtualHost.create({'/outside/secret.txt': 'untouched'})
    const container = {getArchive: vi.fn().mockResolvedValue(archive)}
    // @ts-expect-error This test only exercises the archive download.
    const sandbox = new SystemSandbox(host, new Docker(), container)
    await expect(sandbox.download('/home/sandbox/workspace', '/download')).rejects.toThrow('outside the destination')
    await expect(host.fs.readFile('/outside/secret.txt', 'utf8')).resolves.toBe('untouched')
  })

  test('never writes a downloaded file through an existing symbolic link', async () => {
    const archive = tarStream.pack()
    archive.entry({name: 'workspace/secret.txt'}, 'downloaded')
    archive.finalize()
    const host = VirtualHost.create({'/outside/secret.txt': 'untouched'})
    await host.fs.mkdir('/download')
    await host.fs.symlink('/outside/secret.txt', '/download/secret.txt')
    const container = {getArchive: vi.fn().mockResolvedValue(archive)}
    // @ts-expect-error This test only exercises the archive download.
    const sandbox = new SystemSandbox(host, new Docker(), container)
    await sandbox.download('/home/sandbox/workspace', '/download')
    await expect(host.fs.readFile('/outside/secret.txt', 'utf8')).resolves.toBe('untouched')
    await expect(host.fs.readFile('/download/secret.txt', 'utf8')).resolves.toBe('downloaded')
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
