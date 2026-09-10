'use client'

import {Blankslate, DataTable, Table} from '@primer/react/experimental'
import type {Route} from 'next'
import {useId} from 'react'
import type {ExperimentResults, TreatmentResult} from '../../experiment-results'
import {Link} from '../../components/Link'

type ExperimentSummary = {
  id: string
  name: string
  description: string
  date: string | null
  treatments: Array<TreatmentResult>
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', {maximumFractionDigits: 1})
}

function TreatmentResultsTable({results, label}: {results: Array<TreatmentResult>; label: string}) {
  const labelId = useId()
  return (
    <Table.Container>
      <span className="sr-only" id={labelId}>
        {label}
      </span>
      <DataTable
        aria-labelledby={labelId}
        cellPadding="condensed"
        columns={[
          {id: 'treatment', header: 'Treatment', field: 'treatment', rowHeader: true},
          {id: 'model', header: 'Model', field: 'model'},
          {id: 'effort', header: 'Effort', field: 'reasoningEffort'},
          {id: 'trials', header: 'Trials', field: 'trials', align: 'end'},
          {id: 'scenarios', header: 'Scenarios', field: 'scenarios', align: 'end'},
          {
            id: 'tests',
            header: 'Tests passed',
            field: 'passedTests',
            align: 'end',
            renderCell: row => {
              return row.passRate === null
                ? 'N/A (no tests)'
                : `${row.passedTests}/${row.totalTests} (${formatNumber(row.passRate * 100)}%)`
            },
          },
          {
            id: 'tokens',
            header: 'Output tokens',
            field: 'outputTokens',
            align: 'end',
            renderCell: row => {
              return formatNumber(row.outputTokens)
            },
          },
          {
            id: 'requests',
            header: 'Premium requests',
            field: 'premiumRequests',
            align: 'end',
            renderCell: row => {
              return formatNumber(row.premiumRequests)
            },
          },
          {
            id: 'session',
            header: 'Session time',
            field: 'sessionDurationMs',
            align: 'end',
            renderCell: row => {
              return `${formatNumber(row.sessionDurationMs / 1000)} s`
            },
          },
          {
            id: 'api',
            header: 'API time',
            field: 'totalApiDurationMs',
            align: 'end',
            renderCell: row => {
              return `${formatNumber(row.totalApiDurationMs / 1000)} s`
            },
          },
        ]}
        data={results}
      />
    </Table.Container>
  )
}

function MetricsDescription() {
  return (
    <p className="text-muted">
      Tests passed is the sum of passed tests divided by total tests across recorded trials. Resource usage is the
      average per trial. Treatments are grouped by model and reasoning effort; compare scenario and trial counts before
      comparing performance.
    </p>
  )
}

export function ExperimentsOverview({experiments}: {experiments: Array<ExperimentSummary>}) {
  return (
    <section className="p-4 flex flex-col gap-4" aria-labelledby="experiments-overview-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-medium" id="experiments-overview-heading">
          Experiments
        </h2>
        <Link href="/experiments">View all experiments</Link>
      </div>
      {experiments.length === 0 ? <p>No experiments have been configured yet.</p> : <MetricsDescription />}
      {experiments.map(experiment => {
        return (
          <section className="flex flex-col gap-3" key={experiment.id}>
            <h3 className="text-title-small">
              <Link href={`/experiments/${experiment.id}`}>{experiment.name}</Link>
            </h3>
            <p>{experiment.description}</p>
            {experiment.date ? (
              <p>
                Latest run:{' '}
                <Link href={`/experiments/${experiment.id}/runs/${experiment.date}` as Route}>
                  <time dateTime={experiment.date}>{experiment.date}</time>
                </Link>
                . <Link href={`/experiments/${experiment.id}`}>View scenario results and run history</Link>
              </p>
            ) : null}
            {experiment.treatments.length > 0 ? (
              <TreatmentResultsTable
                label={`Latest treatment results for ${experiment.name}`}
                results={experiment.treatments}
              />
            ) : (
              <p>
                {experiment.date
                  ? 'No trial results were recorded in the latest run.'
                  : 'No results have been recorded for this experiment yet.'}
              </p>
            )}
          </section>
        )
      })}
    </section>
  )
}

export function LatestExperimentResults({id, results}: {id: string; results: ExperimentResults | null}) {
  if (!results) {
    return null
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="latest-results-heading">
      <h2 className="text-title-medium" id="latest-results-heading">
        Latest results
      </h2>
      <p>
        Run:{' '}
        <Link href={`/experiments/${id}/runs/${results.date}` as Route}>
          <time dateTime={results.date}>{results.date}</time>
        </Link>
      </p>
      {results.treatments.length > 0 ? (
        <>
          <MetricsDescription />
          <TreatmentResultsTable label="Latest treatment results" results={results.treatments} />
        </>
      ) : (
        <Blankslate border>
          <Blankslate.Heading as="h3">No trial results</Blankslate.Heading>
          <Blankslate.Description>No trial results were recorded in the latest run.</Blankslate.Description>
        </Blankslate>
      )}
      <h3 className="text-title-small">Scenario results</h3>
      {results.scenarios.map(scenario => {
        return (
          <section className="flex flex-col gap-3" key={scenario.id}>
            <h4 className="text-title-small">{scenario.id}</h4>
            {scenario.treatments.length > 0 ? (
              <>
                <TreatmentResultsTable label={`Treatment results for ${scenario.id}`} results={scenario.treatments} />
                <p>
                  <Link
                    href={
                      `/experiments/${id}/runs/${results.date}#scenario-${encodeURIComponent(scenario.id)}` as Route
                    }
                  >
                    View output for {scenario.id}
                  </Link>
                </p>
              </>
            ) : (
              <p>No trial results were recorded for this scenario.</p>
            )}
          </section>
        )
      })}
    </section>
  )
}
