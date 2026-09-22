import {StrictMode} from 'react'
import {renderToString} from 'react-dom/server'
import {RouterProvider} from '@tanstack/react-router'
import {createSiteRouter} from './router'
import {normalizeBasePath, pageDataPath, serializePageData} from './site-paths'
import {pageTitle, type PageData} from './page-data'
import {generatePages, loadPage} from './page-data.server'
import {getRunAsset, listRunAssetParams} from './run-assets'
import {generateFilePreviewParams, getFilePreview, getFilePreviewResponse} from './file-preview-routes'

export async function renderPage(path: string, data: PageData, template: string) {
  const basePath = normalizeBasePath(process.env.PAGES_BASE_PATH)
  const router = createSiteRouter({url: `${basePath}${path}`, basePath, loadPage: async () => data})
  await router.load()
  const html = renderToString(<StrictMode><RouterProvider router={router} /></StrictMode>)
  return template
    .replace('<title>primer / agent-eval</title>', '')
    .replace('<!--app-html-->', () => html)
    .replace('<!--page-data-->', () => `<script id="page-data" type="application/json">${serializePageData({path, data})}</script>`)
}

export async function* staticFiles(template: string): AsyncGenerator<{path: string; content: string | Uint8Array}> {
  for await (const {path, data} of generatePages()) {
    yield {path: path === '/' ? 'index.html' : `${path.slice(1)}/index.html`, content: await renderPage(path, data, template)}
    yield {path: pageDataPath(path).slice(1), content: serializePageData(data)}
  }
  yield {path: '404.html', content: await renderPage('/404', {type: 'not-found'}, template)}
  for (const {asset} of await listRunAssetParams()) {
    const response = await getRunAsset(asset)
    if (response.status === 404 && asset[0] === '__no-runs__') continue
    if (!response.ok) throw new Error(`Could not export run asset: ${asset.join('/')}`)
    yield {path: `run-data/${asset.map(encodeURIComponent).join('/')}`, content: new Uint8Array(await response.arrayBuffer())}
  }
  for (const params of await generateFilePreviewParams()) {
    if (params.id === '__no-runs__') continue
    const preview = await getFilePreview(params)
    if (!preview) throw new Error(`Could not export file preview: ${JSON.stringify(params)}`)
    yield {path: `file-previews/${[params.collection, params.id, params.date, params.trial, params.file].map(encodeURIComponent).join('/')}/preview.json`, content: JSON.stringify(preview)}
  }
  yield {path: '.nojekyll', content: ''}
}

export async function developmentResponse(pathname: string): Promise<Response> {
  if (pathname.startsWith('/page-data/')) {
    const path = pathname.slice('/page-data'.length).replace(/\.json$/, '')
    const data = await loadPage(path === '/index' ? '/' : path)
    return Response.json(data, {status: data.type === 'not-found' ? 404 : 200})
  }
  if (pathname.startsWith('/run-data/')) return getRunAsset(pathname.slice('/run-data/'.length).split('/').map(decodeURIComponent))
  const match = /^\/file-previews\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/preview\.json$/.exec(pathname)
  if (match) {
    const [, collection, id, date, trial, file] = match.map(decodeURIComponent)
    return getFilePreviewResponse({collection, id, date, trial, file})
  }
  return new Response('Not found', {status: 404})
}

export {pageTitle}
