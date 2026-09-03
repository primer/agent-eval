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
  comparison: Comparison
}

type BenchmarkRun = {
  id: string
  name: string
  resultCount: number
  passedTests: number
  totalTests: number
}

function Delta({comparison}: {comparison: Comparison}) {
  const tone =
    comparison.deltaValue === null
      ? 'text-muted'
      : comparison.deltaValue > 0
        ? 'text-success'
        : comparison.deltaValue < 0
          ? 'text-danger'
          : 'text-muted'

  return <span className={tone}>{comparison.delta}</span>
}

function createTableResults(results: BenchmarkPageResults): Array<TableResult> {
  return results.capabilities.flatMap(capability => {
    return [
      {
        id: capability.id,
        capability: capability.name,
        scenario: capability.scenarios.length > 0 ? 'All scenarios' : 'Not measured',
        comparison: capability.comparison,
      },
      ...capability.scenarios.map(scenario => {
        return {
          id: `${capability.id}-${scenario.id}`,
          capability: '',
          scenario: scenario.id,
          scenarioId: scenario.id,
          comparison: scenario.comparison,
        }
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
            Benchmark pass rates are compared with Control across every configured scenario. Capability rows aggregate
            all of their scenario and model results. Latest results:{' '}
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
                id: 'control',
                header: 'Control',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.control
                },
              },
              {
                id: 'benchmark',
                header: 'Benchmark',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.benchmark
                },
              },
              {
                id: 'delta',
                header: 'Difference',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return <Delta comparison={row.comparison} />
                },
              },
              {
                id: 'control-tests',
                header: 'Control tests',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.controlTests
                },
              },
              {
                id: 'benchmark-tests',
                header: 'Benchmark tests',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.benchmarkTests
                },
              },
            ]}
            data={tableResults}
          />
        </Table.Container>
      ) : (
        <Blankslate border>
          <Blankslate.Heading as="h2">No results</Blankslate.Heading>
          <Blankslate.Description>
            No results have been recorded for this benchmark yet. Run the benchmark to compare its capabilities with
            Control.
          </Blankslate.Description>
        </Blankslate>
      )}
    </Stack>
  )
}
