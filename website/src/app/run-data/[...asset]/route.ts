import {getRunAsset, listRunAssetParams} from '../../../run-assets'

export const dynamic = 'force-static'
export const dynamicParams = false

export async function GET(_request: Request, {params}: {params: Promise<{asset: Array<string>}>}) {
  const {asset} = await params
  return getRunAsset(asset)
}

export const generateStaticParams = listRunAssetParams
