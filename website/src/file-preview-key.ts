import 'server-only'
import {createHash} from 'node:crypto'

export function getFilePreviewKey(filepath: string): string {
  return createHash('sha256').update(filepath).digest('hex')
}
