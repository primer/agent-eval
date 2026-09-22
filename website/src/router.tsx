import {createMemoryHistory, createRootRouteWithContext, createRoute, createRouter, Outlet, useLoaderData} from '@tanstack/react-router'
import Layout from './app/layout'
import {BenchmarkOverview} from './app/components/BenchmarkOverview'
import {ExperimentsOverview} from './app/components/ExperimentResults'
import {BenchmarksTable, ExperimentsTable, ScenariosTable} from './app/components/ResourceTables'
import {RunDetailsView} from './app/components/RunDetailsView'
import {Page as BenchmarkPage} from './app/benchmarks/[id]/components/Page'
import {Page as ExperimentPage} from './app/experiments/[id]/components/Page'
import {Page as ScenarioPage} from './app/scenarios/[id]/components/Page'
import {RouterLink} from './components/RouterLink'
import {pageTitle, type PageData} from './page-data'
import {normalizeBasePath, pageDataPath} from './site-paths'

type RouterContext = {loadPage: (path: string) => Promise<PageData>}

function NotFound() {
  return <div className="p-6"><h1>Page not found</h1><p>This page does not exist.</p><RouterLink href="/">Return to overview</RouterLink></div>
}

function Page() {
  const data = useLoaderData({strict: false}) as PageData
  return <>
    <title>{pageTitle(data)}</title>
    {data.type === 'overview' ? <><BenchmarkOverview {...data.benchmark} /><ExperimentsOverview {...data.experiments} /></> :
    data.type === 'benchmarks' ? <BenchmarksTable {...data.props} /> :
    data.type === 'experiments' ? <ExperimentsTable {...data.props} /> :
    data.type === 'scenarios' ? <ScenariosTable {...data.props} /> :
    data.type === 'benchmark' ? <BenchmarkPage {...data.props} /> :
    data.type === 'experiment' ? <ExperimentPage {...data.props} /> :
    data.type === 'scenario' ? <><meta name="description" content={data.props.scenario.prompt} /><ScenarioPage {...data.props} /></> :
    data.type === 'run' ? <RunDetailsView {...data.props} /> : <NotFound />}
  </>
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Layout><Outlet /></Layout>,
  notFoundComponent: NotFound,
})

const paths = ['/', '/benchmarks', '/benchmarks/$id', '/benchmarks/$id/runs/$date', '/experiments', '/experiments/$id', '/experiments/$id/runs/$date', '/scenarios', '/scenarios/$id', '/404'] as const
const routeTree = rootRoute.addChildren(paths.map(path => createRoute({
  getParentRoute: () => rootRoute,
  path,
  loader: ({context, location}) => context.loadPage(location.pathname),
  component: Page,
})))

export function createSiteRouter(options: {
  url?: string
  basePath?: string
  loadPage?: RouterContext['loadPage']
  initialPage?: {path: string; data: PageData}
} = {}) {
  const basePath = normalizeBasePath(options.basePath ?? import.meta.env.BASE_URL)
  return createRouter({
    routeTree,
    basepath: basePath || '/',
    history: options.url ? createMemoryHistory({initialEntries: [options.url]}) : undefined,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: {
      loadPage: async pathname => {
        const path = pathname.slice(basePath.length).replace(/\/$/, '') || '/'
        if (options.loadPage) return options.loadPage(path)
        if (options.initialPage?.path === path) return options.initialPage.data
        const response = await fetch(`${basePath}${pageDataPath(path)}`)
        if (response.status === 404) return {type: 'not-found'}
        if (!response.ok) throw new Error('Could not load this page. Please reload to retry.')
        return response.json() as Promise<PageData>
      },
    },
  })
}
