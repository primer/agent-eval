import type {ComponentProps} from 'react'
import type {BenchmarkOverview} from './app/components/BenchmarkOverview'
import type {ExperimentsOverview} from './app/components/ExperimentResults'
import type {BenchmarksTable, ExperimentsTable, ScenariosTable} from './app/components/ResourceTables'
import type {RunDetailsViewProps} from './app/components/RunDetailsView'
import type {Page as BenchmarkPage} from './app/benchmarks/[id]/components/Page'
import type {Page as ExperimentPage} from './app/experiments/[id]/components/Page'
import type {Page as ScenarioPage} from './app/scenarios/[id]/components/Page'

export type PageData =
  | {type: 'overview'; benchmark: ComponentProps<typeof BenchmarkOverview>; experiments: ComponentProps<typeof ExperimentsOverview>}
  | {type: 'benchmarks'; props: ComponentProps<typeof BenchmarksTable>}
  | {type: 'experiments'; props: ComponentProps<typeof ExperimentsTable>}
  | {type: 'scenarios'; props: ComponentProps<typeof ScenariosTable>}
  | {type: 'benchmark'; props: ComponentProps<typeof BenchmarkPage>}
  | {type: 'experiment'; props: ComponentProps<typeof ExperimentPage>}
  | {type: 'scenario'; props: ComponentProps<typeof ScenarioPage>}
  | {type: 'run'; props: RunDetailsViewProps}
  | {type: 'not-found'}

export function pageTitle(data: PageData): string {
  let title: string | undefined
  if (data.type === 'benchmarks') title = 'Benchmarks'
  if (data.type === 'experiments') title = 'Experiments'
  if (data.type === 'scenarios') title = 'Scenarios'
  if (data.type === 'scenario') title = data.props.scenario.id
  if (data.type === 'not-found') title = 'Page not found'
  return title ? `${title} · primer / agent-eval` : 'primer / agent-eval'
}
