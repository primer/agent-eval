const cooldown = 7 * 24 * 60 * 60 * 1000

export function getCooledNpmRelease(name: string, metadata: unknown, now = Date.now()): string | undefined {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new Error(`Cannot read npm metadata for ${name}`)
  }
  const tags = 'dist-tags' in metadata ? metadata['dist-tags'] : undefined
  const version = typeof tags === 'object' && tags !== null && 'latest' in tags ? tags.latest : undefined
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:\+[\da-zA-Z.-]+)?$/.test(version)) {
    throw new Error(`Cannot verify a stable npm latest version for ${name}`)
  }
  const published =
    'time' in metadata && typeof metadata.time === 'object' && metadata.time !== null
      ? Object.getOwnPropertyDescriptor(metadata.time, version)?.value
      : undefined
  const timestamp = typeof published === 'string' ? Date.parse(published) : NaN
  if (!Number.isFinite(timestamp) || timestamp > now) {
    throw new Error(`Cannot verify publish time for ${name}@${version}`)
  }
  return now - timestamp >= cooldown ? version : undefined
}

if (import.meta.main) {
  const name = process.argv[2]
  if (!name || !/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name) || process.argv.length !== 3) {
    throw new Error('Usage: node script/get-cooled-npm-release.ts <package>')
  }
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`Cannot verify ${name}: npm returned HTTP ${response.status}`)
  }
  const version = getCooledNpmRelease(name, await response.json())
  if (version) {
    process.stdout.write(`${version}\n`)
  } else {
    process.stderr.write(`${name}@latest is still in the seven-day cooldown.\n`)
  }
}
