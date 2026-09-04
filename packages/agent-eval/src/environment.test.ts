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
      experimentsDirectory: path.resolve('experiments'),
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
        outputPath: './results/output.json',
        scenariosDirectory: './custom-scenarios',
      }),
    ).toEqual({
      artifactsDirectory: path.resolve('results/artifacts'),
      benchmarksDirectory: path.resolve('custom-benchmarks'),
      concurrency: 4,
      copilotToken: 'token',
      dockerImage: 'node:custom',
      experimentsDirectory: path.resolve('custom-experiments'),
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
      experimentsDirectory: path.resolve('experiments'),
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
      experimentsDirectory: path.resolve('experiments'),
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
})
