'use client'

import {Stack} from '@primer/react'
import type {BaselineTrendPoint} from './BaselineTrends'
import {BaselineTrends} from './BaselineTrends'
import type {BaselineResult} from './Index'
import {BaselineResultsTable} from './Index'

export function BaselineOverview({
  results,
  trends,
}: {
  results: Array<BaselineResult>
  trends: Array<BaselineTrendPoint>
}) {
  return (
    <Stack padding="normal" gap="spacious">
      <BaselineResultsTable
        description={
          <>
            Each metric is the average Recommended result across all baseline scenarios, followed by the percent change
            from the average Control result in parentheses.
          </>
        }
        heading="Baseline overview"
        headingId="aggregate-baseline-heading"
        headingLevel="h1"
        results={results}
      />
      <BaselineTrends points={trends} scenarioId="aggregate" />
    </Stack>
  )
}
