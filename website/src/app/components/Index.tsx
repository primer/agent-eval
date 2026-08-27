'use client'

import {NavList, PageLayout, Stack} from '@primer/react'
import {DataTable, Table, Blankslate} from '@primer/react/experimental'
import type {Route} from 'next'
import NextLink from 'next/link'
import {Link} from '../../components/Link'
import {BaselineTrends, type BaselineTrendPoint} from './BaselineTrends'
import styles from './Index.module.css'

type BaselineMetric = {
  raw: string
  change: string | null
}

export type BaselineResult = {
  id: string
  model: string
  reasoningEffort: string
  tests: BaselineMetric
  turns: BaselineMetric
  outputTokens: BaselineMetric
  premiumRequests: BaselineMetric
  totalNanoAiu: BaselineMetric
  apiDuration: BaselineMetric
  sessionDuration: BaselineMetric
  toolCalls: BaselineMetric
}

export type BaselineComparison = {
  id: string
  scenarioId: string
  results: Array<BaselineResult>
}

function Metric({value}: {value: BaselineMetric}) {
  if (value.raw === '—') {
    return '—'
  }

  return (
    <span className={styles.metric}>
      {value.raw} <span className={styles.change}>({value.change ?? '—'})</span>
    </span>
  )
}

export function BaselineResultsTable({
  description,
  heading,
  headingId,
  headingLevel = 'h2',
  results,
}: {
  description?: React.ReactNode
  heading: React.ReactNode
  headingId: string
  headingLevel?: 'h1' | 'h2'
  results: Array<BaselineResult>
}) {
  const descriptionId = `${headingId}-description`

  return (
    <Table.Container>
      <Table.Title as={headingLevel} id={headingId}>
        {heading}
      </Table.Title>
      {description ? (
        <Table.Subtitle as="p" id={descriptionId}>
          {description}
        </Table.Subtitle>
      ) : null}
      <DataTable
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        cellPadding="condensed"
        columns={[
          {
            id: 'model',
            header: 'Model',
            field: 'model',
            rowHeader: true,
            width: 'auto',
          },
          {
            id: 'reasoningEffort',
            header: 'Effort',
            field: 'reasoningEffort',
            width: 'auto',
          },
          {
            id: 'tests',
            header: 'Tests passed',
            field: 'tests',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.tests} />,
          },
          {
            id: 'turns',
            header: 'Turns',
            field: 'turns',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.turns} />,
          },
          {
            id: 'output-tokens',
            header: 'Output tokens',
            field: 'outputTokens',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.outputTokens} />,
          },
          {
            id: 'premium-requests',
            header: 'Premium requests',
            field: 'premiumRequests',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.premiumRequests} />,
          },
          {
            id: 'nano-aiu',
            header: 'Nano AIU',
            field: 'totalNanoAiu',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.totalNanoAiu} />,
          },
          {
            id: 'api-time',
            header: 'API time',
            field: 'apiDuration',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.apiDuration} />,
          },
          {
            id: 'session-time',
            header: 'Session time',
            field: 'sessionDuration',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.sessionDuration} />,
          },
          {
            id: 'tool-calls',
            header: 'Tool calls',
            field: 'toolCalls',
            align: 'end',
            width: 'auto',
            renderCell: row => <Metric value={row.toolCalls} />,
          },
        ]}
        data={results}
      />
    </Table.Container>
  )
}

export function Index({
  baseline,
  baselineTrends,
  selectedScenarioId,
}: {
  baseline: Array<BaselineComparison> | null
  baselineTrends: Array<BaselineTrendPoint>
  selectedScenarioId?: string
}) {
  const selectedScenario = baseline?.find(scenario => scenario.scenarioId === selectedScenarioId) ?? baseline?.[0]

  return (
    <Stack padding="normal" gap="spacious">
      <section>
        {baseline ? (
          <PageLayout className={styles.layout} containerWidth="full" padding="none" rowGap="normal">
            <PageLayout.Pane aria-label="Baseline scenarios" divider="line" padding="none" position="start" sticky>
              <NavList aria-label="Baseline scenarios">
                {baseline.map(scenario => (
                  <NavList.Item
                    as={NextLink}
                    aria-current={scenario.scenarioId === selectedScenario?.scenarioId ? 'page' : undefined}
                    href={`/baseline/${scenario.scenarioId}` as Route}
                    key={scenario.id}
                  >
                    {scenario.scenarioId}
                  </NavList.Item>
                ))}
              </NavList>
            </PageLayout.Pane>
            <PageLayout.Content as="div">
              {selectedScenario ? (
                <Stack gap="spacious">
                  <BaselineResultsTable
                    description={
                      <>
                        Recommended results are shown first, followed by the percent change from Control in parentheses.
                        Positive means the raw value increased and negative means it decreased. Models are ranked by
                        test pass rate within each scenario.
                      </>
                    }
                    heading={
                      <Link href={`/scenarios/${selectedScenario.scenarioId}`}>{selectedScenario.scenarioId}</Link>
                    }
                    headingId={`baseline-${selectedScenario.scenarioId}-heading`}
                    headingLevel="h1"
                    results={selectedScenario.results}
                  />
                  <BaselineTrends points={baselineTrends} scenarioId={selectedScenario.scenarioId} />
                </Stack>
              ) : null}
            </PageLayout.Content>
          </PageLayout>
        ) : (
          <>
            <h1 className="text-title-medium pb-4">Baseline</h1>
            <Blankslate border>
              <Blankslate.Heading as="h2">No results</Blankslate.Heading>
              <Blankslate.Description>
                No baseline results have been recorded yet. Run the baseline tests to see results here.
              </Blankslate.Description>
            </Blankslate>
          </>
        )}
      </section>
    </Stack>
  )
}
