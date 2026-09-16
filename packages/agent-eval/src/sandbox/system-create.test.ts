import {afterEach, expect, test, vi} from 'vitest'
import {buildLocalDockerImage} from './build'
import {SystemSandbox} from './system'

const {buildImage, createContainer, followProgress, remove} = vi.hoisted(() => {
  return {
    buildImage: vi.fn().mockResolvedValue({}),
    createContainer: vi.fn(),
    followProgress: vi.fn((_stream: unknown, done: (error: Error | null) => void) => {
      done(null)
    }),
    remove: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('dockerode', () => {
  return {
    default: class Docker {
      buildImage = buildImage
      createContainer = createContainer
      modem = {followProgress}
    },
  }
})

vi.mock('./build', async importOriginal => {
  return {...(await importOriginal<typeof import('./build')>()), buildLocalDockerImage: vi.fn()}
})

afterEach(() => {
  vi.clearAllMocks()
})

function mockContainers() {
  createContainer.mockImplementation(async () => {
    return {start: vi.fn(), remove}
  })
}

test('builds and wraps a local image once for shared concurrent build options', async () => {
  mockContainers()
  vi.mocked(buildLocalDockerImage).mockResolvedValue('workspace:shared')
  const dockerBuild = {dockerfile: '/project/Dockerfile', context: '/project'}
  const [first, second] = await Promise.all([SystemSandbox.create({dockerBuild}), SystemSandbox.create({dockerBuild})])
  await using firstSandbox = first
  await using secondSandbox = second
  expect(firstSandbox).not.toBe(secondSandbox)

  expect(buildLocalDockerImage).toHaveBeenCalledOnce()
  expect(buildImage).toHaveBeenCalledOnce()
  expect(buildImage).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({buildargs: expect.objectContaining({BASE_IMAGE: 'workspace:shared'})}),
  )
  expect(createContainer).toHaveBeenCalledTimes(2)
})

test('rebuilds local images when a new run supplies new build options', async () => {
  mockContainers()
  vi.mocked(buildLocalDockerImage)
    .mockResolvedValueOnce('workspace:first-run')
    .mockResolvedValueOnce('workspace:second-run')

  await using first = await SystemSandbox.create({
    dockerBuild: {dockerfile: '/project/Dockerfile', context: '/project'},
  })
  await using second = await SystemSandbox.create({
    dockerBuild: {dockerfile: '/project/Dockerfile', context: '/project'},
  })
  expect(first).not.toBe(second)

  expect(buildLocalDockerImage).toHaveBeenCalledTimes(2)
  expect(buildImage).toHaveBeenCalledTimes(2)
})

test('does not cache a failed local image build or start its container', async () => {
  mockContainers()
  const error = new Error('Build failed')
  vi.mocked(buildLocalDockerImage).mockRejectedValueOnce(error).mockResolvedValueOnce('workspace:retry')
  const dockerBuild = {dockerfile: '/project/Dockerfile', context: '/project'}

  await expect(SystemSandbox.create({dockerBuild})).rejects.toBe(error)
  expect(createContainer).not.toHaveBeenCalled()
  await using sandbox = await SystemSandbox.create({dockerBuild})
  expect(sandbox).toBeInstanceOf(SystemSandbox)
  expect(buildLocalDockerImage).toHaveBeenCalledTimes(2)
  expect(createContainer).toHaveBeenCalledOnce()
})

test('rejects conflicting image and build options', async () => {
  await expect(
    SystemSandbox.create({
      dockerImage: 'project:latest',
      dockerBuild: {dockerfile: '/project/Dockerfile', context: '/project'},
    }),
  ).rejects.toThrow('Specify either dockerImage or dockerBuild, not both')
  expect(buildImage).not.toHaveBeenCalled()
  expect(buildLocalDockerImage).not.toHaveBeenCalled()
  expect(createContainer).not.toHaveBeenCalled()
})
