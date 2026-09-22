import fs from 'node:fs/promises'
import {getLocalMedia} from './snapshot'

export async function generateStaticParams() {
  return ['index.json', ...(await getLocalMedia()).keys()].map(key => ({asset: key.split('/')}))
}

export async function GET(_request: Request, {params}: {params: Promise<{asset: Array<string>}>}) {
  const {asset} = await params
  const assets = await getLocalMedia()
  if (asset.join('/') === 'index.json') return Response.json([...assets.keys()])
  const media = assets.get(asset.join('/'))
  if (!media) return new Response('Not found', {status: 404})
  return new Response(await fs.readFile(media.filepath), {
    headers: {'Content-Type': media.mimeType, 'X-Content-Type-Options': 'nosniff'},
  })
}
