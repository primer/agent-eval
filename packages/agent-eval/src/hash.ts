/* eslint-disable */

/**
 * JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)
 *
 * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
 * @see http://github.com/garycourt/murmurhash-js
 * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
 * @see http://sites.google.com/site/murmurhash/
 *
 * @param key String encoded as UTF-8
 * @param seed Positive integer only
 * @return 32-bit positive integer hash
 */
export function hash(key: string, seed: number = 0): string {
  const keyBytes = Buffer.from(key, 'utf8')
  let remainder
  let bytes
  let h1
  let h1b
  let c1
  let c2
  let k1
  let i

  remainder = keyBytes.length & 3 // keyBytes.length % 4
  bytes = keyBytes.length - remainder
  h1 = seed
  c1 = 0xcc9e2d51
  c2 = 0x1b873593
  i = 0

  while (i < bytes) {
    k1 = keyBytes[i] | (keyBytes[++i] << 8) | (keyBytes[++i] << 16) | (keyBytes[++i] << 24)
    ++i

    k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff
    k1 = (k1 << 15) | (k1 >>> 17)
    k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff

    h1 ^= k1
    h1 = (h1 << 13) | (h1 >>> 19)
    h1b = ((h1 & 0xffff) * 5 + ((((h1 >>> 16) * 5) & 0xffff) << 16)) & 0xffffffff
    h1 = (h1b & 0xffff) + 0x6b64 + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16)
  }

  k1 = 0

  switch (remainder) {
    case 3:
      k1 ^= keyBytes[i + 2] << 16
    case 2:
      k1 ^= keyBytes[i + 1] << 8
    case 1:
      k1 ^= keyBytes[i]

      k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff
      k1 = (k1 << 15) | (k1 >>> 17)
      k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff
      h1 ^= k1
  }

  h1 ^= keyBytes.length

  h1 ^= h1 >>> 16
  h1 = ((h1 & 0xffff) * 0x85ebca6b + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff
  h1 ^= h1 >>> 13
  h1 = ((h1 & 0xffff) * 0xc2b2ae35 + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16)) & 0xffffffff
  h1 ^= h1 >>> 16

  return `${h1 >>> 0}`
}
