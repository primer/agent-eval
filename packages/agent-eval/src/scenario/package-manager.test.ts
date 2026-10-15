import {expect, test} from 'vitest'
import {parsePackageManager} from './package-manager'

test.each([
  {name: 'the default', value: undefined, expected: {name: 'npm'}},
  {name: 'a versioned npm manager', value: 'npm@10.8.2', expected: {name: 'npm', specifier: 'npm@10.8.2'}},
  {name: 'a versioned pnpm manager', value: 'pnpm@10.1.0', expected: {name: 'pnpm', specifier: 'pnpm@10.1.0'}},
  {
    name: 'a versioned manager with integrity',
    value: 'pnpm@12.11.2+sha512.25a51652a196785af5f28bda',
    expected: {name: 'pnpm', specifier: 'pnpm@12.11.2+sha512.25a51652a196785af5f28bda'},
  },
  {name: 'a versioned Yarn manager', value: 'yarn@4.6.0', expected: {name: 'yarn', specifier: 'yarn@4.6.0'}},
])('parsePackageManager parses $name package manager declarations', ({value, expected}) => {
  expect(parsePackageManager(value)).toEqual(expected)
})

test.each(['pnpm', 'bun@1.2.3', 'pnpm@latest', 'pnpm@10'])(
  'parsePackageManager rejects invalid package manager declaration %s',
  value => {
    expect(() => parsePackageManager(value)).toThrow(/Invalid packageManager field/)
  },
)

test('parsePackageManager rejects non-string values', () => {
  expect(() => parsePackageManager(42)).toThrow(/must be a package manager name and version/)
})
