import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'

const require = createRequire(import.meta.url)
const entry = require.resolve(/* turbopackIgnore: true */ '@primer/agent-eval')
const {listBenchmarks, listExperiments, listScenarios}: typeof import('@primer/agent-eval') = await import(
  /* turbopackIgnore: true */ pathToFileURL(entry).href
)

export {listBenchmarks, listExperiments, listScenarios}
