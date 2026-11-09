import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {setTimeout} from 'node:timers/promises'
import {parseArgs} from 'node:util'
import {isMap, isScalar, parseAllDocuments} from 'yaml'

interface RegistryMetadata {
  versions?: Record<string, unknown>
  time?: Record<string, unknown>
}

async function fetchMetadata(name: string, registryUrl: URL): Promise<RegistryMetadata> {
  const retries = 3
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined
    try {
      response = await fetch(new URL(encodeURIComponent(name), registryUrl), {
        signal: AbortSignal.timeout(30_000),
      })
      if (response.ok) {
        const metadata = await response.json()
        if (typeof metadata !== 'object' || metadata === null) {
          throw new Error(`Cannot read registry metadata for ${name}`)
        }
        const versions = 'versions' in metadata ? metadata.versions : undefined
        const time = 'time' in metadata ? metadata.time : undefined
        return {
          versions:
            typeof versions === 'object' && versions !== null ? Object.fromEntries(Object.entries(versions)) : {},
          time: typeof time === 'object' && time !== null ? Object.fromEntries(Object.entries(time)) : {},
        }
      }
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Cannot verify ${name}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        })
      }
      response = undefined
    }

    if (
      response &&
      (attempt === retries || (response.status < 500 && response.status !== 408 && response.status !== 429))
    ) {
      if (response.status === 404) {
        throw new Error(`Configured registry does not have package ${name}`)
      }
      throw new Error(`Cannot verify ${name}: configured registry returned HTTP ${response.status}`)
    }

    await setTimeout(1000 * 2 ** attempt)
  }
}

function getLockedPackages(lockfiles: Record<string, string>) {
  const packages = new Map<string, Map<string, Set<string>>>()

  for (const [filename, source] of Object.entries(lockfiles)) {
    for (const document of parseAllDocuments(source)) {
      if (document.errors.length > 0) {
        throw new Error(`Cannot parse ${filename}: ${document.errors[0]?.message}`)
      }
      if (!isMap(document.contents) || document.get('lockfileVersion') !== '9.0') {
        throw new Error(`${filename} must use pnpm lockfileVersion 9.0 to verify package release ages`)
      }
      const entries = document.get('packages', true)
      if (entries === undefined) {
        continue
      }
      if (!isMap(entries)) {
        throw new Error(`Cannot read packages in ${filename}`)
      }

      for (const {key} of entries.items) {
        if (!isScalar(key) || typeof key.value !== 'string') {
          throw new Error(`Cannot read package name in ${filename}`)
        }
        if (!/^((?:@[^/]+\/)?[^@]+)@(\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?)$/.test(key.value)) {
          // Local archives and Git dependencies have no registry publish time.
          if (/@(?:file:|link:|https?:|git(?:\+|:)|github:|gitlab:|bitbucket:)/.test(key.value)) {
            continue
          }
          throw new Error(`Cannot verify package version for ${key.value} in ${filename}`)
        }
        const separator = key.value.lastIndexOf('@')
        const name = key.value.slice(0, separator)
        const version = key.value.slice(separator + 1)
        let versions = packages.get(name)
        if (!versions) {
          versions = new Map()
          packages.set(name, versions)
        }
        let filenames = versions.get(version)
        if (!filenames) {
          filenames = new Set()
          versions.set(version, filenames)
        }
        filenames.add(filename)
      }
    }
  }

  return packages
}

export async function checkPackageReleaseAge(
  lockfiles: Record<string, string>,
  baseLockfiles: Record<string, string>,
  getMetadata: (name: string) => Promise<RegistryMetadata>,
  now = Date.now(),
) {
  const packages = getLockedPackages(lockfiles)
  for (const [name, versions] of getLockedPackages(baseLockfiles)) {
    const currentVersions = packages.get(name)
    if (!currentVersions) {
      continue
    }
    for (const version of versions.keys()) {
      currentVersions.delete(version)
    }
    if (currentVersions.size === 0) {
      packages.delete(name)
    }
  }

  const cutoff = now - 7 * 24 * 60 * 60 * 1000
  const errors: Array<string> = []
  const entries = [...packages]
  const concurrency = 20
  for (let index = 0; index < entries.length; index += concurrency) {
    await Promise.all(
      entries.slice(index, index + concurrency).map(async ([name, versions]) => {
        const metadata = await getMetadata(name)
        for (const [version, filenames] of versions) {
          const label = `${name}@${version} (${[...filenames].join(', ')})`
          if (!metadata.versions || !Object.hasOwn(metadata.versions, version)) {
            errors.push(`Configured registry does not have package version ${label}`)
            continue
          }
          const timestamp = metadata.time?.[version]
          const published = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
          if (!Number.isFinite(published)) {
            errors.push(`Cannot verify publish time for ${label}`)
          } else if (published > cutoff) {
            errors.push(`${label} is younger than 7 days (published ${timestamp})`)
          }
        }
      }),
    )
  }

  return errors
}

if (import.meta.main) {
  try {
    const {values, positionals} = parseArgs({
      options: {
        diff: {
          type: 'boolean',
        },
      },
      allowPositionals: true,
    })
    if (positionals.length > 1 || (!values.diff && positionals.length > 0)) {
      throw new Error('Usage: node script/check-package-release-age.ts [--diff [base-ref]]')
    }
    const filenames = execFileSync('git', ['ls-files', '-z', '*pnpm-lock.yaml'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
    if (filenames.length === 0) {
      throw new Error('No tracked pnpm lockfiles found')
    }
    const lockfiles = Object.fromEntries(
      filenames.map(filename => {
        return [filename, readFileSync(filename, 'utf8')]
      }),
    )
    let baseLockfiles: Record<string, string> = {}
    if (values.diff) {
      const base = execFileSync('git', ['merge-base', 'HEAD', positionals[0] || 'origin/main'], {
        encoding: 'utf8',
      }).trim()
      const baseFilenames = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', base], {
        encoding: 'utf8',
      })
        .split('\0')
        .filter(filename => {
          return filename.endsWith('pnpm-lock.yaml')
        })
      baseLockfiles = Object.fromEntries(
        baseFilenames.map(filename => {
          return [
            filename,
            execFileSync('git', ['show', `${base}:${filename}`], {
              encoding: 'utf8',
              maxBuffer: 50 * 1024 * 1024,
            }),
          ]
        }),
      )
    }
    const registry = execFileSync('pnpm', ['config', 'get', 'registry'], {
      encoding: 'utf8',
    }).trim()
    const registryUrl = new URL(registry.endsWith('/') ? registry : `${registry}/`)
    const errors = await checkPackageReleaseAge(lockfiles, baseLockfiles, async name => {
      return fetchMetadata(name, registryUrl)
    })
    for (const error of errors) {
      process.stderr.write(`::error::${error}\n`)
    }
    if (errors.length > 0) {
      process.exitCode = 1
    } else {
      process.stdout.write('All checked registry package versions are at least 7 days old.\n')
    }
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
