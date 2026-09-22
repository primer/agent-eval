export function normalizeBasePath(value = ''): string {
  if (value === '' || value === '/') return ''
  if (!/^\/[\w/-]+$/.test(value) || value.includes('//') || value.split('/').includes('..')) {
    throw new Error('PAGES_BASE_PATH must be an absolute URL pathname')
  }
  return value.replace(/\/$/, '')
}

export function pageDataPath(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/'
  return `/page-data${path === '/' ? '/index' : path}.json`
}

export function serializePageData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
