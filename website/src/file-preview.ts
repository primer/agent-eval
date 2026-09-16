type FilePreviewToken = {
  content: string
  offset: number
  style: Record<string, string>
}

type FilePreviewData =
  | {type: 'text'; content: string}
  | {type: 'unavailable'; reason: string}
  | {type: 'highlighted'; content: string; tokens: Array<FilePreviewToken>}

type FilePreviewReference =
  {type: 'remote'; url: string} | {type: 'text'; content: string} | {type: 'unavailable'; reason: string}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFilePreviewData(value: unknown): value is FilePreviewData {
  if (!isRecord(value)) {
    return false
  }
  if (value.type === 'unavailable') {
    return typeof value.reason === 'string'
  }
  if (value.type === 'text') {
    return typeof value.content === 'string'
  }
  return (
    value.type === 'highlighted' &&
    typeof value.content === 'string' &&
    Array.isArray(value.tokens) &&
    value.tokens.every((token: unknown) => {
      return (
        isRecord(token) &&
        typeof token.content === 'string' &&
        typeof token.offset === 'number' &&
        Number.isInteger(token.offset) &&
        token.offset >= 0 &&
        isRecord(token.style) &&
        Object.values(token.style).every(style => {
          return typeof style === 'string'
        })
      )
    })
  )
}

export {isFilePreviewData}
export type {FilePreviewData, FilePreviewReference}
