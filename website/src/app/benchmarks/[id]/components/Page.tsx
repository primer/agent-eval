'use client'

import {Breadcrumbs, Stack} from '@primer/react'
import {Blankslate, DataTable, Table} from '@primer/react/experimental'
import type {Route} from 'next'
import NextLink from 'next/link'
import type {BenchmarkPageResults} from '../../../../benchmark-results'
import type {Benchmark} from '../../../../benchmarks'
import {Link} from '../../../../components/Link'

type Comparison = BenchmarkPageResults['comparison']

type TableResult = {
  id: string
  scenario: string
  scenarioId?: string
  model: string
  reasoningEffort: string
  comparison: Comparison
}

type BenchmarkRun = {
  id: string
  name: string
  resultCount: number | null
  checks: string
  unavailableReason?: string
}

function createTableResults(results: BenchmarkPageResults): Array<TableResult> {
  return [
    {
      id: 'all',
      scenario: 'All scenarios',
      model: 'All models',
      reasoningEffort: '',
      comparison: results.comparison,
    },
    ...results.scenarios.flatMap(scenario => {
      return [
        {
          id: scenario.id,
          scenario: scenario.id,
          scenarioId: scenario.id,
          model: 'All models',
          reasoningEffort: '',
          comparison: scenario.comparison,
        },
        ...scenario.models.map(model => {
          return {
            id: `${scenario.id}-${model.id}`,
            scenario: '',
            model: model.model,
            reasoningEffort: model.reasoningEffort,
            comparison: model.comparison,
          }
        }),
      ]
    }),
  ]
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
      <p className="bg-attention-muted border border-attention-muted rounded-md p-4">
        Capability-level results are unavailable because the current result format does not record each trial&apos;s
        capability. Results below aggregate trials by scenario and model without inferring capability membership.
      </p>
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
                {
                  id: 'results',
                  header: 'Results',
                  field: 'resultCount',
                  align: 'end',
                  renderCell: row => {
                    return row.resultCount ?? 'N/A'
                  },
                },
                {
                  id: 'checks',
                  header: 'Checks',
                  field: 'checks',
                  align: 'end',
                },
                {
                  id: 'status',
                  header: 'Status',
                  field: 'unavailableReason',
                  renderCell: row => {
                    return row.unavailableReason ?? 'Available'
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
          <Table.Title as="h2" id="scenario-results-heading">
            Scenario performance
          </Table.Title>
          <Table.Subtitle as="p" id="scenario-results-description">
            Benchmark results are shown first, followed by the percent change from Control in parentheses. Checks
            average per-check, per-trial pass percentages or measurement means, keeping units and directions separate.
            Skips and errors are excluded from values and shown separately. Latest results:{' '}
            <Link href={`/benchmarks/${benchmark.id}/runs/${results.date}` as Route}>
              <time dateTime={results.date}>{results.date}</time>
            </Link>
            .
          </Table.Subtitle>
          <DataTable
            aria-describedby="scenario-results-description"
            aria-labelledby="scenario-results-heading"
            cellPadding="condensed"
            columns={[
              {
                id: 'scenario',
                header: 'Scenario',
                field: 'scenario',
                rowHeader: true,
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
                id: 'checks',
                header: 'Checks',
                field: 'comparison',
                align: 'end',
                renderCell: row => {
                  return row.comparison.checks
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
