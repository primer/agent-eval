'use client'

import {Breadcrumbs, Stack} from '@primer/react'
import {Blankslate, DataTable, Table} from '@primer/react/experimental'
import type {Experiment} from '../../../../experiments'
import {Link} from '../../../../components/Link'
import type {Route} from 'next'
import NextLink from 'next/link'

type ExperimentRun = {
  id: string
  name: string
  resultCount: number
  passedTests: number
  totalTests: number
}

type Props = {
  experiment: Experiment
  runs: Array<ExperimentRun>
}

export function Page({experiment, runs}: Props) {
  return (
    <Stack padding="normal" gap="spacious">
      <Breadcrumbs>
        <Breadcrumbs.Item as={NextLink} href="/experiments">
          Experiments
        </Breadcrumbs.Item>
        <Breadcrumbs.Item selected>{experiment.id}</Breadcrumbs.Item>
      </Breadcrumbs>
      <div>
        <h1>{experiment.name}</h1>
        <p>{experiment.description}</p>
      </div>
      <section>
        <h2 className="text-title-medium pb-4">Runs</h2>
        {runs.length > 0 ? (
          <Table.Container>
            <DataTable
              aria-label={`Runs for ${experiment.name}`}
              columns={[
                {
                  id: 'date',
                  header: 'Date',
                  field: 'name',
                  rowHeader: true,
                  renderCell: row => (
                    <Link href={`/experiments/${experiment.id}/runs/${row.name}` as Route}>
                      <time dateTime={row.name}>{row.name}</time>
                    </Link>
                  ),
                },
                {id: 'results', header: 'Results', field: 'resultCount', align: 'end'},
                {
                  id: 'tests',
                  header: 'Tests passed',
                  field: 'passedTests',
                  align: 'end',
                  renderCell: row => `${row.passedTests}/${row.totalTests}`,
                },
              ]}
              data={runs}
            />
          </Table.Container>
        ) : (
          <Blankslate border>
            <Blankslate.Heading as="h3">No runs</Blankslate.Heading>
            <Blankslate.Description>No results have been recorded for this experiment yet.</Blankslate.Description>
          </Blankslate>
        )}
      </section>
    </Stack>
  )
}
