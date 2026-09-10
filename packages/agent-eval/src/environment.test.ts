import path from 'node:path'
import {describe, expect, test} from 'vitest'
import {DEFAULT_DOCKER_IMAGE} from './sandbox'
import {getEnvironmentConfig} from './environment'

describe('getEnvironmentConfig', () => {
  test('resolves default paths and values', () => {
    expect(
      getEnvironmentConfig({
        copilotToken: 'token',
      }),
    ).toEqual({
      artifactsDirectory: path.resolve('artifacts'),
      benchmarksDirectory: path.resolve('benchmarks'),
      concurrency: 1,
      copilotToken: 'token',
      dockerImage: DEFAULT_DOCKER_IMAGE,
      execution: {
        captureWalkthrough: true,
        installDependencies: true,
      },
      experimentsDirectory: path.resolve('experiments'),
      failFast: false,
      maxRetries: 3,
      outputPath: path.resolve('output.json'),
      scenariosDirectory: path.resolve('scenarios'),
    })
  })

  test('uses valid custom values', () => {
    expect(
      getEnvironmentConfig({
        benchmarksDirectory: './custom-benchmarks',
        concurrency: '4',
        copilotToken: 'token',
        dockerImage: 'node:custom',
        experimentsDirectory: './custom-experiments',
        failFast: true,
        maxAiCredits: '100',
        maxRetries: '0',
        outputPath: './results/output.json',
        scenariosDirectory: './custom-scenarios',
        timeoutMs: '600000',
      }),
    ).toEqual({
      artifactsDirectory: path.resolve('results/artifacts'),
      benchmarksDirectory: path.resolve('custom-benchmarks'),
      concurrency: 4,
      copilotToken: 'token',
      dockerImage: 'node:custom',
      execution: {
        captureWalkthrough: true,
        installDependencies: true,
        maxAiCredits: 100,
        timeoutMs: 600000,
      },
      experimentsDirectory: path.resolve('custom-experiments'),
      failFast: true,
      maxRetries: 0,
      outputPath: path.resolve('results/output.json'),
      scenariosDirectory: path.resolve('custom-scenarios'),
    })
  })

  test('derives the output and artifacts paths from an output directory', () => {
    expect(
      getEnvironmentConfig({
        copilotToken: 'token',
        outputDirectory: './results/run',
      }),
    ).toEqual({
      artifactsDirectory: path.resolve('results/run/artifacts'),
      benchmarksDirectory: path.resolve('benchmarks'),
      concurrency: 1,
      copilotToken: 'token',
      dockerImage: DEFAULT_DOCKER_IMAGE,
      execution: {
        captureWalkthrough: true,
        installDependencies: true,
      },
      experimentsDirectory: path.resolve('experiments'),
      failFast: false,
      maxRetries: 3,
      outputPath: path.resolve('results/run/output.json'),
      scenariosDirectory: path.resolve('scenarios'),
    })
  })

  test('derives the output filename from the shard within an output directory', () => {
    expect(
      getEnvironmentConfig({
        copilotToken: 'token',
        outputDirectory: './results/run',
        shard: {
          order: 2,
          total: 4,
        },
      }),
    ).toEqual({
      artifactsDirectory: path.resolve('results/run/artifacts'),
      benchmarksDirectory: path.resolve('benchmarks'),
      concurrency: 1,
      copilotToken: 'token',
      dockerImage: DEFAULT_DOCKER_IMAGE,
      execution: {
        captureWalkthrough: true,
        installDependencies: true,
      },
      experimentsDirectory: path.resolve('experiments'),
      failFast: false,
      maxRetries: 3,
      outputPath: path.resolve('results/run/output-2.json'),
      scenariosDirectory: path.resolve('scenarios'),
    })
  })

  test('rejects output directory combinations with explicit output paths', () => {
    expect(() => {
      getEnvironmentConfig({
        copilotToken: 'token',
        outputDirectory: './results/run',
        outputPath: './output.json',
      })
    }).toThrow('--output-dir cannot be combined with --output')
  })

  test.each(['0', '-1', 'invalid', '1.5'])('falls back to one for invalid concurrency %s', concurrency => {
    expect(
      getEnvironmentConfig({
        concurrency,
        copilotToken: 'token',
      }).concurrency,
    ).toBe(1)
  })

  test('configures a prepared image and disables walkthrough capture', () => {
    const preparedImage = `example.test/agent-eval/runtime@sha256:${'a'.repeat(64)}`

    expect(
      getEnvironmentConfig({
        captureWalkthrough: false,
        copilotToken: 'token',
        installDependencies: false,
        preparedImage,
      }),
    ).toMatchObject({
      dockerImage: DEFAULT_DOCKER_IMAGE,
      execution: {
        captureWalkthrough: false,
        installDependencies: false,
      },
      preparedImage,
    })
  })

  test('rejects invalid execution and retry settings', () => {
    expect(() => {
      getEnvironmentConfig({
        copilotToken: 'token',
        maxAiCredits: '29',
      })
    }).toThrow('maxAiCredits')
    expect(() => {
      getEnvironmentConfig({
        copilotToken: 'token',
        maxRetries: '-1',
      })
    }).toThrow('--max-retries')
    expect(() => {
      getEnvironmentConfig({
        copilotToken: 'token',
        timeoutMs: 'NaN',
      })
    }).toThrow('--timeout-ms')
  })

  test('rejects combining prepared and base images', () => {
    expect(() => {
      getEnvironmentConfig({
        copilotToken: 'token',
        dockerImage: 'node:custom',
        preparedImage: `sha256:${'a'.repeat(64)}`,
      })
    }).toThrow('--prepared-image cannot be combined with --docker-image')
  })

  test('rejects an empty prepared image instead of falling back', () => {
    expect(() => {
      getEnvironmentConfig({
        copilotToken: 'token',
        preparedImage: '   ',
      })
    }).toThrow('--prepared-image must not be empty')
  })
})
