import {describe, expect, test} from 'vitest'
import {CONTAINER_WORKDIR} from './constants'
import {resolveContainerPath} from './path'

describe('resolveContainerPath', () => {
  test('resolves relative paths from the container workdir', () => {
    expect(resolveContainerPath('nested/../example.txt')).toBe(`${CONTAINER_WORKDIR}/example.txt`)
  })

  test('normalizes absolute container paths', () => {
    expect(resolveContainerPath('/tmp/nested/../example.txt')).toBe('/tmp/example.txt')
  })
})
