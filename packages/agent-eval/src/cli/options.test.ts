import {describe, expect, test} from 'vitest'
import {getRunPlanExecutionOptions} from './options'

const defaults = {
  'docker-image': 'node:26',
  'install-dependencies': true,
  'max-retries': '3',
  walkthrough: true,
}

describe('getRunPlanExecutionOptions', () => {
  test('parses the default Docker execution options', () => {
    expect(getRunPlanExecutionOptions(defaults)).toEqual({
      dockerImage: 'node:26',
      maxRetries: 3,
      execution: {
        captureWalkthrough: true,
        installDependencies: true,
      },
    })
  })

  test('prefers a prepared image and parses bounded execution controls', () => {
    const preparedImage = `sha256:${'a'.repeat(64)}`

    expect(
      getRunPlanExecutionOptions({
        ...defaults,
        'install-dependencies': false,
        'max-retries': '0',
        'prepared-image': ` ${preparedImage} `,
        'timeout-ms': '600000',
        walkthrough: false,
      }),
    ).toEqual({
      preparedImage,
      maxRetries: 0,
      execution: {
        captureWalkthrough: false,
        installDependencies: false,
        timeoutMs: 600_000,
      },
    })
  })

  test.each([
    ['max-retries', '-1', 0],
    ['max-retries', '1.5', 0],
    ['timeout-ms', '0', 1],
    ['timeout-ms', 'invalid', 1],
  ] as const)('rejects invalid --%s value %j', (option, value, minimum) => {
    expect(() => {
      getRunPlanExecutionOptions({
        ...defaults,
        [option]: value,
      })
    }).toThrow(`Expected --${option} to be an integer greater than or equal to ${minimum}`)
  })
})
