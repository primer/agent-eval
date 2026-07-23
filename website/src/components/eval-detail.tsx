'use client'

import {ArrowLeftIcon, CheckCircleIcon, TrophyIcon} from '@primer/octicons-react'
import {CounterLabel, Heading, Label, Link, PageLayout, Text} from '@primer/react'
import {createColumnHelper, DataTable} from '@primer/react/experimental'
import type {EvalDetail as EvalDetailData, ModelSummary} from '../evals'
import {formatDecimal, formatDuration, formatInteger} from './format'
import {ScoreCell} from './score-cell'
import styles from './eval-detail.module.css'

const column = createColumnHelper<ModelSummary>()

const columns = [
  column.column({
    id: 'model',
    header: 'Model',
    rowHeader: true,
    minWidth: '13rem',
    renderCell: model => (
      <div className={styles.modelName}>
        <Text weight="semibold">{model.id}</Text>
        {model.isBest ? <Label variant="success">Best</Label> : null}
      </div>
    ),
  }),
  column.column({
    field: 'compliance',
    header: 'Compliance',
    align: 'end',
    sortBy: 'basic',
    renderCell: model => <ScoreCell label={`${model.id} compliance`} value={model.compliance} />,
  }),
  column.column({
    id: 'checks',
    header: 'Avg checks',
    align: 'end',
    renderCell: model => (
      <Text whiteSpace="nowrap">
        {formatDecimal(model.averageChecksPassed)} / {model.checksPerRun}
      </Text>
    ),
  }),
  column.column({
    field: 'averageLatencyMs',
    header: 'Avg latency',
    align: 'end',
    sortBy: 'basic',
    renderCell: model => <Text whiteSpace="nowrap">{formatDuration(model.averageLatencyMs)}</Text>,
  }),
  column.column({
    field: 'averageTurns',
    header: 'Avg turns',
    align: 'end',
    sortBy: 'basic',
    renderCell: model => formatDecimal(model.averageTurns),
  }),
  column.column({
    field: 'averageOutputTokens',
    header: 'Avg output',
    align: 'end',
    sortBy: 'basic',
    renderCell: model => formatInteger(model.averageOutputTokens),
  }),
  column.column({
    field: 'averagePremiumRequests',
    header: 'Avg premium requests',
    align: 'end',
    sortBy: 'basic',
    renderCell: model => formatDecimal(model.averagePremiumRequests),
  }),
]

type EvalDetailProps = {
  evalData: EvalDetailData
}

export function EvalDetail({evalData}: EvalDetailProps) {
  return (
    <PageLayout containerWidth="xlarge" padding="normal" rowGap="normal">
      <PageLayout.Header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeftIcon aria-hidden="true" />
          All evals
        </Link>
        <div className={styles.titleBlock}>
          <div>
            <Text as="p" size="small" weight="semibold" className={styles.eyebrow}>
              {evalData.id}
            </Text>
            <Heading as="h1" variant="large">
              {evalData.title}
            </Heading>
            <Text as="p" size="large" className={styles.description}>
              {evalData.description}
            </Text>
          </div>
          <div className={styles.bestModelCard}>
            <div className={styles.bestModelLabel}>
              <TrophyIcon aria-hidden="true" />
              <Text size="small" weight="semibold">
                Best model
              </Text>
            </div>
            <Text as="strong" className={styles.bestModelName}>
              {evalData.bestModel}
            </Text>
            <Text size="small" className={styles.muted}>
              Highest compliance, with speed and output size used as tie-breakers.
            </Text>
          </div>
        </div>
      </PageLayout.Header>

      <PageLayout.Content>
        <div className={styles.contentGrid}>
          <section aria-labelledby="prompt-title">
            <Heading as="h2" variant="medium" id="prompt-title">
              Prompt
            </Heading>
            <pre className={styles.prompt}>
              <code>{evalData.prompt}</code>
            </pre>
          </section>

          <section aria-labelledby="checks-title">
            <div className={styles.sectionHeading}>
              <Heading as="h2" variant="medium" id="checks-title">
                Compliance checks
              </Heading>
              <CounterLabel>{evalData.checksPerRun}</CounterLabel>
            </div>
            {evalData.complianceChecks.length > 0 ? (
              <ul className={styles.checkList}>
                {evalData.complianceChecks.map(check => (
                  <li key={check}>
                    <CheckCircleIcon aria-hidden="true" className={styles.checkIcon} />
                    <Text>{check}</Text>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptyChecks}>
                <Text weight="semibold">{evalData.checksPerRun} historical checks recorded</Text>
                <Text size="small" className={styles.muted}>
                  The individual test names are unavailable because this eval is no longer present in the working tree.
                </Text>
              </div>
            )}
          </section>
        </div>

        <section className={styles.models} aria-labelledby="models-title">
          <div className={styles.sectionHeading}>
            <div>
              <Heading as="h2" variant="medium" id="models-title">
                Model breakdown
              </Heading>
              <Text as="p" className={styles.muted}>
                Aggregated across {evalData.treatmentCount} treatments and {evalData.runCount} recorded runs.
              </Text>
            </div>
            <Label variant="success">{evalData.bestModel} leads</Label>
          </div>
          <div className={styles.table}>
            <DataTable
              aria-labelledby="models-title"
              cellPadding="spacious"
              columns={columns}
              data={evalData.models}
              initialSortColumn="compliance"
              initialSortDirection="DESC"
            />
          </div>
        </section>
      </PageLayout.Content>
    </PageLayout>
  )
}
