'use client'

import {Stack} from '@primer/react'
import {DataTable, Table, Blankslate} from '@primer/react/experimental'
import type {Experiment} from '../../experiments'
import {Link} from '../../components/Link'
import type {ScenarioSummary} from '../../scenarios'
import {ExperimentsTable, ScenariosTable} from './ResourceTables'

export type BaselineComparison = {
  id: string
  scenarioId: string
  model: string
  reasoningEffort: string
  tests: string
  turns: string
  outputTokens: string
  premiumRequests: string
  apiDuration: string
  sessionDuration: string
  toolCalls: string
}

export function Index({
  baseline,
  experiments,
  scenarios,
}: {
  baseline: Array<BaselineComparison> | null
  experiments: Array<Experiment>
  scenarios: Array<ScenarioSummary>
}) {
  return (
    <Stack padding="normal" gap="spacious">
      <section>
        {baseline ? (
          <Table.Container>
            <Table.Title as="h1" id="baseline-heading">
              Baseline
            </Table.Title>
            <Table.Subtitle as="p" id="baseline-description">
              Each value is the baseline delta from Control. A positive value means the baseline performed better for
              that metric; a negative value means it performed worse. An em dash means the result was not recorded.
            </Table.Subtitle>
            <DataTable
              aria-labelledby="baseline-heading"
              aria-describedby="baseline-description"
              cellPadding="condensed"
              columns={[
                {
                  id: 'scenarioId',
                  header: 'Scenario',
                  field: 'scenarioId',
                  rowHeader: true,
                  maxWidth: '36ch',
                  renderCell: row => <Link href={`/scenarios/${row.scenarioId}`}>{row.scenarioId}</Link>,
                },
                {id: 'model', header: 'Model', field: 'model', width: 'auto'},
                {
                  id: 'reasoningEffort',
                  header: 'Effort',
                  field: 'reasoningEffort',
                  width: 'auto',
                },
                {
                  id: 'tests',
                  header: 'Test pass rate',
                  field: 'tests',
                  align: 'end',
                  width: 'auto',
                },
                {
                  id: 'turns',
                  header: 'Turns',
                  field: 'turns',
                  align: 'end',
                  width: 'auto',
                },
                {
                  id: 'output-tokens',
                  header: 'Output tokens',
                  field: 'outputTokens',
                  align: 'end',
                  width: 'auto',
                },
                {
                  id: 'premium-requests',
                  header: 'Premium requests',
                  field: 'premiumRequests',
                  align: 'end',
                  width: 'auto',
                },
                {
                  id: 'api-time',
                  header: 'API time',
                  field: 'apiDuration',
                  align: 'end',
                  width: 'auto',
                },
                {
                  id: 'session-time',
                  header: 'Session time',
                  field: 'sessionDuration',
                  align: 'end',
                  width: 'auto',
                },
                {
                  id: 'tool-calls',
                  header: 'Tool calls',
                  field: 'toolCalls',
                  align: 'end',
                  width: 'auto',
                },
              ]}
              data={baseline}
            />
          </Table.Container>
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
      <ScenariosTable scenarios={scenarios} showViewAll />
      <ExperimentsTable experiments={experiments} showViewAll />
    </Stack>
  )
}
