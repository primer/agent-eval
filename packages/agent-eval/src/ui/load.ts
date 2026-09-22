import {createRequire} from 'node:module'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

type UiOptions = {
  mode: 'dev' | 'build'
  results: string
  port?: string
  outputDirectory?: string
  basePath?: string
}

async function runUi(options: UiOptions, cwd = process.cwd()): Promise<void> {
  const require = createRequire(path.join(cwd, 'package.json'))
  let entry: string
  try {
    entry = require.resolve('@primer/agent-eval-website/runtime')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
      throw err
    }
    throw new Error(
      'The results UI is an opt-in package. Install it in your project with npm install --save-dev @primer/agent-eval-website, then run agent-eval ui again.',
      {cause: err},
    )
  }
  const ui = await import(pathToFileURL(entry).href)
  await ui.runUi({
    ...options,
    results: path.resolve(cwd, options.results),
    ...(options.outputDirectory ? {outputDirectory: path.resolve(cwd, options.outputDirectory)} : {}),
  })
}

export {runUi}
