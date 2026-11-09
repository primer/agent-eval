import {describe, expect, test} from 'vitest'
import {checkPackageReleaseAge} from './check-package-release-age'

const now = Date.parse('2026-11-09T12:00:00Z')

function lockfile(...packages: Array<string>) {
  return `lockfileVersion: '9.0'\npackages:\n${packages
    .map(name => {
      return `  '${name}': {}`
    })
    .join('\n')}\n`
}

describe('checkPackageReleaseAge', () => {
  test('checks packages in both pnpm lockfile documents and accepts the seven-day boundary', async () => {
    const checked: Array<string> = []
    const errors = await checkPackageReleaseAge(
      {
        'pnpm-lock.yaml': `${lockfile('pnpm@12.16.1')}---\n${lockfile('@scope/example@1.0.0')}`,
      },
      {},
      async name => {
        checked.push(name)
        const version = name === 'pnpm' ? '12.16.1' : '1.0.0'
        return {
          versions: {
            [version]: {},
          },
          time: {
            [version]: '2026-11-02T12:00:00Z',
          },
        }
      },
      now,
    )

    expect(checked.sort()).toEqual(['@scope/example', 'pnpm'])
    expect(errors).toEqual([])
  })

  test('ignores existing versions even when they move between lockfiles', async () => {
    const checked: Array<string> = []
    const errors = await checkPackageReleaseAge(
      {
        'pnpm-lock.yaml': lockfile('example@1.0.0', 'example@2.0.0'),
      },
      {
        'nested/pnpm-lock.yaml': lockfile('example@1.0.0'),
      },
      async name => {
        checked.push(name)
        return {
          versions: {
            '2.0.0': {},
          },
          time: {
            '2.0.0': '2026-11-09T00:00:00Z',
          },
        }
      },
      now,
    )

    expect(checked).toEqual(['example'])
    expect(errors).toEqual(['example@2.0.0 (pnpm-lock.yaml) is younger than 7 days (published 2026-11-09T00:00:00Z)'])
  })

  test('rejects a pnpm upgrade younger than seven days even when workspace dependencies are unchanged', async () => {
    const checked: Array<string> = []
    const errors = await checkPackageReleaseAge(
      {
        'pnpm-lock.yaml': `${lockfile('pnpm@12.16.2')}---\n${lockfile('example@1.0.0')}`,
      },
      {
        'pnpm-lock.yaml': `${lockfile('pnpm@12.16.1')}---\n${lockfile('example@1.0.0')}`,
      },
      async name => {
        checked.push(name)
        return {
          versions: {
            '12.16.2': {},
          },
          time: {
            '12.16.2': '2026-11-08T12:00:00Z',
          },
        }
      },
      now,
    )

    expect(checked).toEqual(['pnpm'])
    expect(errors).toEqual(['pnpm@12.16.2 (pnpm-lock.yaml) is younger than 7 days (published 2026-11-08T12:00:00Z)'])
  })

  test.each([
    {
      label: 'missing version',
      metadata: {},
      message: 'Configured registry does not have package version example@1.0.0 (pnpm-lock.yaml)',
    },
    {
      label: 'missing timestamp',
      metadata: {
        versions: {
          '1.0.0': {},
        },
      },
      message: 'Cannot verify publish time for example@1.0.0 (pnpm-lock.yaml)',
    },
    {
      label: 'invalid timestamp',
      metadata: {
        versions: {
          '1.0.0': {},
        },
        time: {
          '1.0.0': 'not a date',
        },
      },
      message: 'Cannot verify publish time for example@1.0.0 (pnpm-lock.yaml)',
    },
  ])('fails closed for $label', async ({metadata, message}) => {
    const errors = await checkPackageReleaseAge(
      {
        'pnpm-lock.yaml': lockfile('example@1.0.0'),
      },
      {},
      async () => {
        return metadata
      },
      now,
    )

    expect(errors).toEqual([message])
  })

  test('does not contact the registry when no registry versions are added', async () => {
    const errors = await checkPackageReleaseAge(
      {
        'pnpm-lock.yaml': lockfile('example@1.0.0', 'local@file:../local.tgz'),
      },
      {
        'pnpm-lock.yaml': lockfile('example@1.0.0'),
      },
      async () => {
        throw new Error('Unexpected registry request')
      },
      now,
    )

    expect(errors).toEqual([])
  })

  test('fails closed when the registry is unavailable', async () => {
    await expect(
      checkPackageReleaseAge(
        {
          'pnpm-lock.yaml': lockfile('example@1.0.0'),
        },
        {},
        async () => {
          throw new Error('Registry unavailable')
        },
        now,
      ),
    ).rejects.toThrow('Registry unavailable')
  })

  test.each([
    ['malformed YAML', "lockfileVersion: '9.0'\npackages: ["],
    ['unsupported lockfile version', "lockfileVersion: '6.0'\npackages: {}"],
    ['invalid package entry', lockfile('invalid')],
  ])('rejects %s instead of silently skipping the audit', async (_label, source) => {
    await expect(
      checkPackageReleaseAge(
        {
          'pnpm-lock.yaml': source,
        },
        {},
        async () => {
          throw new Error('Unexpected registry request')
        },
        now,
      ),
    ).rejects.toThrow()
  })
})
