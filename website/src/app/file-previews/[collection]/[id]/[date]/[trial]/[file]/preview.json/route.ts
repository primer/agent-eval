import {
  generateFilePreviewParams,
  getFilePreview,
  type FilePreviewParams,
} from '../../../../../../../../file-preview-routes'

export const dynamic = 'force-static'
export const dynamicParams = false

export async function generateStaticParams(): Promise<Array<FilePreviewParams>> {
  return generateFilePreviewParams()
}

export async function GET(_request: Request, {params}: {params: Promise<FilePreviewParams>}): Promise<Response> {
  const preview = await getFilePreview(await params)
  if (!preview) {
    return Response.json({error: 'File preview not found.'}, {status: 404})
  }
  return Response.json(preview)
}
