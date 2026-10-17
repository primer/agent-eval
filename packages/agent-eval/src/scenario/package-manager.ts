const PackageManagerPattern =
  /^(npm|pnpm|yarn)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(\+sha(?:224|256|384|512)\.[A-Za-z0-9+/=_-]+)?$/

type PackageManager = {name: 'npm'; specifier?: string} | {name: 'pnpm' | 'yarn'; specifier: string}

function parsePackageManager(value: unknown): PackageManager {
  if (value === undefined) {
    return {name: 'npm'}
  }

  if (typeof value !== 'string') {
    throw new Error('The packageManager field must be a package manager name and version, such as "pnpm@10.1.0"')
  }

  const match = PackageManagerPattern.exec(value)
  if (!match) {
    throw new Error(
      `Invalid packageManager field "${value}". Expected npm, pnpm, or yarn with a version, such as "pnpm@10.1.0"`,
    )
  }

  const name = match[1]
  if (name === 'npm') {
    return {name, specifier: value}
  }
  if (name === 'pnpm' || name === 'yarn') {
    return {name, specifier: value}
  }

  throw new Error(`Unsupported packageManager field "${value}"`)
}

export {parsePackageManager}
export type {PackageManager}
