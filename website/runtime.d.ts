export type UiOptions = {
  mode: 'dev' | 'build'
  results: string
  port?: string
  outputDirectory?: string
  basePath?: string
}

export function runUi(options: UiOptions): Promise<void>
