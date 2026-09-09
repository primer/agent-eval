'use client'

import {Stack} from '@primer/react'
import {Blankslate, DataTable, Table} from '@primer/react/experimental'
import type {Route} from 'next'
import type {ExperimentOverviewData, ExperimentResultSummary, ResourceMetric} from '../../experiment-results'
import {Link} from '../../components/Link'

export function scenarioResultAnchor(scenarioId: string): string {
  return `scenario-result-${encodeURIComponent(scenarioId)}`
}

function number(value: number): string {
  return value.toLocaleString('en-US', {maximumFractionDigits: 1})
}

function delta(value: number | null, unit: string): string {
  return value === null ? 'N/A' : `${value > 0 ? '+' : ''}${number(value)}${unit}`
}

function Metric({value, change, baseline}: {value: string; change: string; baseline: boolean}) {
  return (
    <span className="whitespace-nowrap">
      {value}
      {!baseline ? <span className="text-muted"> ({change})</span> : null}
    </span>
  )
}

const comparisonLabels: Record<ExperimentResultSummary['comparison'], string> = {
  control: 'Baseline',
  matched: 'Matched',
  'missing-control': 'Missing Control',
  unbalanced: 'Unbalanced trials',
  'no-trials': 'No trials',
}

const resourceColumns: Array<{metric: ResourceMetric; header: string; duration?: boolean}> = [
  {metric: 'outputTokens', header: 'Output tokens'},
  {metric: 'premiumRequests', header: 'Premium requests'},
  {metric: 'turns', header: 'Turns'},
  {metric: 'sessionDurationMs', header: 'Session time', duration: true},
  {metric: 'totalApiDurationMs', header: 'API time', duration: true},
]

function ResultsTable({
  results,
  title,
  headingId,
  detailHref,
  experimentWide = false,
}: {
  results: Array<ExperimentResultSummary>
  title: string
  headingId: string
  detailHref?: Route
  experimentWide?: boolean
}) {
  const treatmentNames = new Map<string, Set<string>>()
  for (const result of results) {
    const ids = treatmentNames.get(result.treatment) ?? new Set<string>()
    ids.add(result.treatmentId)
    treatmentNames.set(result.treatment, ids)
  }

  return (
    <Table.Container>
      <Table.Title as={experimentWide ? 'h2' : 'h3'} className="text-title-medium" id={headingId}>
        {title}
      </Table.Title>
      {detailHref ? (
        <Table.Subtitle as="p">
          <Link href={detailHref}>View all trials and result details</Link>
        </Table.Subtitle>
      ) : null}
      <DataTable
        aria-labelledby={headingId}
        aria-describedby="experiment-comparison-description"
        cellPadding="condensed"
        data={results}
        columns={[
          {id: 'model', header: 'Model', field: 'model', rowHeader: true},
          {
            id: 'effort',
            header: 'Effort',
            field: 'reasoningEffort',
            renderCell: row => row.reasoningEffort ?? 'Default',
          },
          {
            id: 'treatment',
            header: 'Treatment',
            field: 'treatment',
            renderCell: row =>
              (treatmentNames.get(row.treatment)?.size ?? 0) > 1
                ? `${row.treatment} (${row.treatmentId})`
                : row.treatment,
          },
          {id: 'trials', header: 'Trials', field: 'trialCount', align: 'end'},
          ...(experimentWide
            ? [{id: 'scenarios', header: 'Scenarios', field: 'scenarioCount' as const, align: 'end' as const}]
            : []),
          {
            id: 'tests',
            header: 'Tests passed',
            field: 'passRate',
            align: 'end',
            renderCell: row => (
              <div className="whitespace-nowrap">
                <Metric
                  value={row.passRate === null ? 'N/A' : `${number(row.passRate)}%`}
                  change={delta(row.passRateDelta, ' pp')}
                  baseline={row.comparison === 'control'}
                />
                <div className="text-caption text-muted">
                  {row.passedTests}/{row.totalTests} tests
                </div>
              </div>
            ),
          },
          ...resourceColumns.map(({metric, header, duration}) => ({
            id: metric,
            header,
            field: 'means' as const,
            align: 'end' as const,
            renderCell: (row: ExperimentResultSummary) => {
              const value = row.means[metric]
              return (
                <Metric
                  value={value === null ? 'N/A' : duration ? `${number(value / 1000)} s` : number(value)}
                  change={delta(row.resourceDeltas[metric], '%')}
                  baseline={row.comparison === 'control'}
                />
              )
            },
          })),
          {
            id: 'comparison',
            header: 'Control comparison',
            field: 'comparison',
            renderCell: row => comparisonLabels[row.comparison],
          },
        ]}
      />
    </Table.Container>
  )
}

export function ExperimentOverview({
  overview,
  runHref,
  date,
}: {
  overview: ExperimentOverviewData
  runHref?: Route
  date: string
}) {
  if (!overview.results.some(result => result.trialCount > 0)) {
    return (
      <Blankslate border>
        <Blankslate.Heading as="h2">No results</Blankslate.Heading>
        <Blankslate.Description>No trials were recorded for this run.</Blankslate.Description>
      </Blankslate>
    )
  }

  return (
    <Stack gap="spacious">
      <div>
        <p className="mt-0">
          {runHref ? (
            <>
              Latest results: <Link href={runHref}><time dateTime={date}>{date}</time></Link>
            </>
          ) : (
            <>Results for <time dateTime={date}>{date}</time></>
          )}
        </p>
        <p className="text-muted mb-0" id="experiment-comparison-description">
          Tests show the pooled pass rate and change from Control in percentage points (pp). Resource metrics are
          per-trial means with percent change from Control in parentheses; lower resource usage is better. Comparisons
          use the same model and reasoning effort. N/A means no tests or trials, missing Control, unbalanced scenario
          coverage or trial counts, or a zero resource baseline. Unbalanced results are not compared. These are
          descriptive results, not statistical significance estimates.
        </p>
      </div>
      <ResultsTable
        results={overview.results}
        title="Experiment overview"
        headingId="experiment-overview-heading"
        experimentWide
      />
      <section className="flex flex-col gap-4" aria-labelledby="scenario-comparisons-heading">
        <h2 className="text-title-medium m-0" id="scenario-comparisons-heading">Scenario comparisons</h2>
        {overview.scenarios.map((scenario, index) => (
          <ResultsTable
            key={scenario.id}
            title={scenario.id}
            headingId={`scenario-comparison-${index}-heading`}
            results={scenario.results}
            detailHref={scenario.results.some(result => result.trialCount > 0)
              ? `${runHref ?? ''}#${scenarioResultAnchor(scenario.id)}` as Route
              : undefined}
          />
        ))}
      </section>
    </Stack>
  )
}
