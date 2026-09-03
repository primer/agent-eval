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
        artifactsDirectory: './custom-artifacts',
        benchmarksDirectory: './custom-benchmarks',
        concurrency: '4',
        copilotToken: 'token',
        dockerImage: 'node:custom',
        experimentsDirectory: './custom-experiments',
        outputPath: './results/output.json',
        scenariosDirectory: './custom-scenarios',
      }),
    ).toEqual({
      artifactsDirectory: path.resolve('custom-artifacts'),
      benchmarksDirectory: path.resolve('custom-benchmarks'),
      concurrency: 4,
      copilotToken: 'token',
      dockerImage: 'node:custom',
      experimentsDirectory: path.resolve('custom-experiments'),
      outputPath: path.resolve('results/output.json'),
      scenariosDirectory: path.resolve('custom-scenarios'),
    })
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
