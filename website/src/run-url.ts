import type {Route} from 'next'

function getRunId(collection: 'benchmarks' | 'experiments', resourceId: string, date: string): string {
  return `${collection}-${resourceId}-${date}`
}

function getRunHref(collection: 'benchmarks' | 'experiments', resourceId: string, date: string): Route {
  return `/runs/${encodeURIComponent(getRunId(collection, resourceId, date))}` as Route
}

export {getRunId, getRunHref}
