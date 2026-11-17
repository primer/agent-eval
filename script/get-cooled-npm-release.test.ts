import {expect, test} from 'vitest'
import {getCooledNpmRelease} from './get-cooled-npm-release'

const now = Date.parse('2026-11-17T12:00:00Z')

test('accepts the stable latest tag at exactly seven days', () => {
  const metadata = {'dist-tags': {latest: '2.0.0'}, time: {'2.0.0': '2026-11-10T12:00:00Z'}}
  expect(getCooledNpmRelease('pnpm', metadata, now)).toBe('2.0.0')
})

test('defers a recent latest tag without substituting an older release', () => {
  const metadata = {
    'dist-tags': {latest: '2.0.0'},
    time: {'1.9.0': '2026-11-01T12:00:00Z', '2.0.0': '2026-11-10T12:00:00.001Z'},
  }
  expect(getCooledNpmRelease('pnpm', metadata, now)).toBeUndefined()
})

test('rejects latest when it is a prerelease', () => {
  const metadata = {'dist-tags': {latest: '2.0.0-rc.1'}, time: {'2.0.0-rc.1': '2026-11-01T12:00:00Z'}}
  expect(() => getCooledNpmRelease('pnpm', metadata, now)).toThrow('Cannot verify a stable npm latest version')
})

test.each([undefined, 'not a timestamp', '2026-11-18T00:00:00Z'])(
  'rejects an unverifiable publish time (%s)',
  published => {
    const metadata = {'dist-tags': {latest: '2.0.0'}, time: {'2.0.0': published}}
    expect(() => getCooledNpmRelease('pnpm', metadata, now)).toThrow('Cannot verify publish time')
  },
)
