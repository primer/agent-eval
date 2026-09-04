'use client'

import {Stack} from '@primer/react'
import {Blankslate, DataTable, Table} from '@primer/react/experimental'
import type {Route} from 'next'
import type {BenchmarkOverviewData} from '../../benchmark-results'
import type {Benchmark} from '../../benchmarks'
import {Link} from '../../components/Link'
import {BenchmarkTrends} from './BenchmarkTrends'
import styles from './BenchmarkOverview.module.css'

type BenchmarkOverviewResult = BenchmarkOverviewData['results'][number]

function Metric({value}: {value: string}) {
  const match = /^(.*) \((.*)\)$/.exec(value)
  if (!match) {
    return value
  }

  return (
    <span className={styles.metric}>
      {match[1]} <span className={styles.change}>({match[2]})</span>
    </span>
  )
}

function BenchmarkResultsTable({
  benchmark,
  date,
  results,
}: {
  benchmark: Benchmark
  date: string | null
  results: Array<BenchmarkOverviewResult>
}) {
  if (results.length === 0) {
    return (
      <>
        <h1 className="text-title-medium">{benchmark.name} benchmark</h1>
        <Blankslate border>
          <Blankslate.Heading as="h2">No results</Blankslate.Heading>
          <Blankslate.Description>No results have been recorded for this benchmark yet.</Blankslate.Description>
        </Blankslate>
      </>
    )
  }

  return (
    <Table.Container>
      <Table.Title as="h1" className="text-title-medium" id="benchmark-overview-heading">
        {benchmark.name} benchmark
      </Table.Title>
      <Table.Subtitle as="p" id="benchmark-overview-description">
        Each metric is the Benchmark result across all capabilities, followed by the percent change from Control in
        parentheses. Models are ranked by test performance, followed by resource usage.
        {date ? (
          <>
            {' '}
            Latest results:{' '}
            <Link href={`/benchmarks/${benchmark.id}/runs/${date}` as Route}>
              <time dateTime={date}>{date}</time>
            </Link>
            .
          </>
        ) : null}
      </Table.Subtitle>
      <DataTable
        aria-describedby="benchmark-overview-description"
        aria-labelledby="benchmark-overview-heading"
        cellPadding="condensed"
        columns={[
          {
            id: 'model',
            header: 'Model',
            field: 'model',
            rowHeader: true,
          },
          {
            id: 'reasoning-effort',
            header: 'Effort',
            field: 'reasoningEffort',
          },
          {
            id: 'tests',
            header: 'Tests',
            field: 'comparison',
            align: 'end',
            renderCell: row => {
              return <Metric value={row.comparison.tests} />
            },
          },
          {
            id: 'output-tokens',
            header: 'Output tokens',
            field: 'comparison',
            align: 'end',
            renderCell: row => {
              return <Metric value={row.comparison.outputTokens} />
            },
          },
          {
            id: 'premium-requests',
            header: 'Premium requests',
            field: 'comparison',
            align: 'end',
            renderCell: row => {
              return <Metric value={row.comparison.premiumRequests} />
            },
          },
          {
            id: 'session-time',
            header: 'Session time',
            field: 'comparison',
            align: 'end',
            renderCell: row => {
              return <Metric value={row.comparison.sessionTime} />
            },
          },
          {
            id: 'api-time',
            header: 'API time',
            field: 'comparison',
            align: 'end',
            renderCell: row => {
              return <Metric value={row.comparison.apiTime} />
            },
          },
        ]}
        data={results}
      />
    </Table.Container>
  )
}

export function BenchmarkOverview({benchmark, overview}: {benchmark: Benchmark; overview: BenchmarkOverviewData}) {
  return (
    <Stack padding="normal" gap="spacious">
      <BenchmarkResultsTable benchmark={benchmark} date={overview.date} results={overview.results} />
      <BenchmarkTrends capabilities={benchmark.capabilities} points={overview.trends} />
    </Stack>
  )
}
