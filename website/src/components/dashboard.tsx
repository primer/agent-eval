'use client'

import {BeakerIcon, TrophyIcon} from '@primer/octicons-react'
import {CounterLabel, Heading, Label, Link, PageLayout, Text} from '@primer/react'
import {createColumnHelper, DataTable} from '@primer/react/experimental'
import type {DashboardData, EvalSummary} from '../evals'
import {formatDecimal, formatDuration, formatInteger, formatPercent} from './format'
import {ScoreCell} from './score-cell'
import styles from './dashboard.module.css'

const column = createColumnHelper<EvalSummary>()

const columns = [
  column.column({
    id: 'eval',
    header: 'Eval',
    rowHeader: true,
    minWidth: '18rem',
    renderCell: evalSummary => (
      <div className={styles.evalCell}>
        <Link href={`/evals/${evalSummary.id}`} className={styles.evalLink}>
          {evalSummary.title}
        </Link>
        <Text as="span" size="small" className={styles.muted}>
          {evalSummary.description}
        </Text>
      </div>
    ),
  }),
  column.column({
    id: 'bestModel',
    header: 'Best model',
    minWidth: '12rem',
    renderCell: evalSummary => (
      <div className={styles.bestModel}>
        <TrophyIcon aria-hidden="true" />
        <Text weight="semibold">{evalSummary.bestModel}</Text>
      </div>
    ),
  }),
  column.column({
    id: 'compliance',
    header: 'Compliance',
    align: 'end',
    sortBy: 'basic',
    renderCell: evalSummary => <ScoreCell label={`${evalSummary.title} compliance`} value={evalSummary.compliance} />,
  }),
  column.column({
    id: 'checks',
    header: 'Avg checks',
    align: 'end',
    renderCell: evalSummary => (
      <Text whiteSpace="nowrap">
        {formatDecimal(evalSummary.averageChecksPassed)} / {evalSummary.checksPerRun}
      </Text>
    ),
  }),
  column.column({
    field: 'averageLatencyMs',
    header: 'Avg latency',
    align: 'end',
    sortBy: 'basic',
    renderCell: evalSummary => <Text whiteSpace="nowrap">{formatDuration(evalSummary.averageLatencyMs)}</Text>,
  }),
  column.column({
    field: 'averageTurns',
    header: 'Avg turns',
    align: 'end',
    sortBy: 'basic',
    renderCell: evalSummary => formatDecimal(evalSummary.averageTurns),
  }),
  column.column({
    field: 'averageOutputTokens',
    header: 'Avg output',
    align: 'end',
    sortBy: 'basic',
    renderCell: evalSummary => formatInteger(evalSummary.averageOutputTokens),
  }),
]

type DashboardProps = {
  data: DashboardData
}

export function Dashboard({data}: DashboardProps) {
  return (
    <PageLayout containerWidth="xlarge" padding="normal" rowGap="normal">
      <PageLayout.Header className={styles.header}>
        <div className={styles.eyebrow}>
          <BeakerIcon aria-hidden="true" />
          <Text weight="semibold">Agent evaluation suite</Text>
        </div>
        <div className={styles.headingRow}>
          <div>
            <Heading as="h1" variant="large">
              Eval results
            </Heading>
            <Text as="p" size="large" className={styles.intro}>
              Compare model compliance, speed, and efficiency across every recorded agent scenario.
            </Text>
          </div>
          <Label variant="success" size="large">
            {formatPercent(data.compliance)} overall compliance
          </Label>
        </div>
      </PageLayout.Header>

      <PageLayout.Content>
        <section className={styles.stats} aria-label="Evaluation summary">
          <div className={styles.stat}>
            <Text size="small" weight="semibold" className={styles.muted}>
              Evals
            </Text>
            <Text as="strong" className={styles.statValue}>
              {data.evalCount}
            </Text>
          </div>
          <div className={styles.stat}>
            <Text size="small" weight="semibold" className={styles.muted}>
              Models
            </Text>
            <Text as="strong" className={styles.statValue}>
              {data.modelCount}
            </Text>
          </div>
          <div className={styles.stat}>
            <Text size="small" weight="semibold" className={styles.muted}>
              Recorded runs
            </Text>
            <Text as="strong" className={styles.statValue}>
              {data.runCount}
            </Text>
          </div>
          <div className={styles.stat}>
            <Text size="small" weight="semibold" className={styles.muted}>
              Compliance
            </Text>
            <Text as="strong" className={styles.statValue}>
              {formatPercent(data.compliance)}
            </Text>
          </div>
        </section>

        <section className={styles.results} aria-labelledby="eval-table-title">
          <div className={styles.sectionHeading}>
            <div>
              <Heading as="h2" variant="medium" id="eval-table-title">
                Scenarios
              </Heading>
              <Text as="p" className={styles.muted}>
                Best model is ranked by compliance, then latency and output size.
              </Text>
            </div>
            <CounterLabel>{data.evalCount}</CounterLabel>
          </div>
          <div className={styles.table}>
            <DataTable
              aria-labelledby="eval-table-title"
              cellPadding="spacious"
              columns={columns}
              data={data.evals}
              initialSortColumn="id"
              initialSortDirection="ASC"
            />
          </div>
        </section>
      </PageLayout.Content>
    </PageLayout>
  )
}
