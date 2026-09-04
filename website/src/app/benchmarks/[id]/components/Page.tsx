'use client'

import {Breadcrumbs, Stack} from '@primer/react'
import {Blankslate, DataTable, Table} from '@primer/react/experimental'
import type {Route} from 'next'
import NextLink from 'next/link'
import type {BenchmarkPageResults} from '../../../../benchmark-results'
import type {Benchmark} from '../../../../benchmarks'
import {Link} from '../../../../components/Link'

type Comparison = BenchmarkPageResults['capabilities'][number]['comparison']

type TableResult = {
  id: string
  capability: string
  scenario: string
  scenarioId?: string
  model: string
  reasoningEffort: string
  comparison: Comparison
}

type BenchmarkRun = {
  id: string
  name: string
  resultCount: number
  passedTests: number
  totalTests: number
}

function createTableResults(results: BenchmarkPageResults): Array<TableResult> {
  return results.capabilities.flatMap(capability => {
    return [
      {
        id: capability.id,
        capability: capability.name,
        scenario: capability.scenarios.length > 0 ? 'All scenarios' : 'Not measured',
        model: 'All models',
        reasoningEffort: '',
        comparison: capability.comparison,
      },
      ...capability.scenarios.flatMap(scenario => {
        return [
          {
            id: `${capability.id}-${scenario.id}`,
            capability: '',
            scenario: scenario.id,
            scenarioId: scenario.id,
            model: 'All models',
            reasoningEffort: '',
            comparison: scenario.comparison,
          },
          ...scenario.models.map(model => {
            return {
              id: `${capability.id}-${scenario.id}-${model.id}`,
              capability: '',
              scenario: '',
              model: model.name,
              reasoningEffort: model.reasoningEffort,
              comparison: model.comparison,
            }
          }),
        ]
      }),
    ]
  })
}

export function Page({
  benchmark,
  results,
  runs,
}: {
  benchmark: Benchmark
  results: BenchmarkPageResults | null
  runs: Array<BenchmarkRun>
}) {
  const tableResults = results ? createTableResults(results) : []

  return (
    <Stack padding="normal" gap="spacious">
      <Breadcrumbs>
        <Breadcrumbs.Item as={NextLink} href="/benchmarks">
          Benchmarks
        </Breadcrumbs.Item>
        <Breadcrumbs.Item selected>{benchmark.id}</Breadcrumbs.Item>
      </Breadcrumbs>
      <header>
        <h1>{benchmark.name}</h1>
        <p>{benchmark.description}</p>
      </header>
      <section>
        <h2 className="text-title-medium pb-4">Runs</h2>
        {runs.length > 0 ? (
          <Table.Container>
            <DataTable
              aria-label={`Runs for ${benchmark.name}`}
              columns={[
                {
                  id: 'date',
                  header: 'Date',
                  field: 'name',
                  rowHeader: true,
                  renderCell: row => {
                    return (
                      <Link href={`/benchmarks/${benchmark.id}/runs/${row.name}` as Route}>
                        <time dateTime={row.name}>{row.name}</time>
                      </Link>
                    )
                  },
                },
                {id: 'results', header: 'Results', field: 'resultCount', align: 'end'},
                {
                  id: 'tests',
                  header: 'Tests passed',
                  field: 'passedTests',
                  align: 'end',
                  renderCell: row => {
                    return `${row.passedTests}/${row.totalTests}`
                  },
                },
              ]}
              data={runs}
            />
          </Table.Container>
        ) : (
          <Blankslate border>
            <Blankslate.Heading as="h3">No runs</Blankslate.Heading>
            <Blankslate.Description>No results have been recorded for this benchmark yet.</Blankslate.Description>
          </Blankslate>
        )}
      </section>
      {results ? (
        <Table.Container>
          <Table.Title as="h2" id="capability-results-heading">
            Capability performance
          </Table.Title>
          <Table.Subtitle as="p" id="capability-results-description">
            Benchmark results are shown first, followed by the percent change from Control in parentheses. Capability
            rows aggregate all of their scenario and model results. Latest results:{' '}
            <Link href={`/benchmarks/${benchmark.id}/runs/${results.date}` as Route}>
              <time dateTime={results.date}>{results.date}</time>
            </Link>
            .
          </Table.Subtitle>
          <DataTable
            aria-describedby="capability-results-description"
            aria-labelledby="capability-results-heading"
            cellPadding="condensed"
            columns={[
              {
                id: 'capability',
                header: 'Capability',
                field: 'capability',
                rowHeader: true,
                maxWidth: '32ch',
              },
              {
                id: 'scenario',
                header: 'Scenario',
                field: 'scenario',
                maxWidth: '1fr',
                renderCell: row => {
                  return row.scenarioId ? (
                    <Link href={`/scenarios/${row.scenarioId}` as Route}>{row.scenario}</Link>
                  ) : (
                    row.scenario
                  )
                },
              },
              {
                id: 'model',
                header: 'Model',
                field: 'model',
              },
              {
                id: 'reasoning-effort',
                header: 'Reasoning effort',
                field: 'reasoningEffort',
              },
              {
                id: 'tests',
                header: 'Tests',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.tests
                },
              },
              {
                id: 'output-tokens',
                header: 'Output tokens',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.outputTokens
                },
              },
              {
                id: 'premium-requests',
                header: 'Premium requests',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.premiumRequests
                },
              },
              {
                id: 'session-time',
                header: 'Session time',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.sessionTime
                },
              },
              {
                id: 'api-time',
                header: 'API time',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.apiTime
                },
              },
            ]}
            data={tableResults}
          />
        </Table.Container>
      ) : null}
    </Stack>
  )
}
