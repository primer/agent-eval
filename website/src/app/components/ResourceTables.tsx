'use client'

import {Stack} from '@primer/react'
import {DataTable, Table} from '@primer/react/experimental'
import type {Experiment} from '../../experiments'
import {Link} from '../../components/Link'
import type {Scenario} from '../../scenarios'

type ResourceTableProps = {
  headingLevel?: 'h1' | 'h2'
  showViewAll?: boolean
  standalone?: boolean
}

function withStandaloneLayout(content: React.ReactNode, standalone: boolean) {
  return standalone ? <Stack padding="normal">{content}</Stack> : content
}

export function ScenariosTable({
  scenarios,
  headingLevel = 'h2',
  showViewAll = false,
  standalone = false,
}: ResourceTableProps & {
  scenarios: Array<Scenario>
}) {
  return withStandaloneLayout(
    <section>
      <Table.Container>
        <Table.Title as={headingLevel} id="scenarios-heading">
          Scenarios
        </Table.Title>
        {showViewAll ? (
          <Table.Actions>
            <Link href="/scenarios">View all</Link>
          </Table.Actions>
        ) : null}
        <DataTable
          aria-labelledby="scenarios-heading"
          columns={[
            {
              id: 'id',
              header: 'ID',
              field: 'id',
              rowHeader: true,
              maxWidth: '40ch',
              renderCell: row => <Link href={`/scenarios/${row.id}`}>{row.id}</Link>,
            },
            {id: 'prompt', header: 'Prompt', field: 'prompt', maxWidth: '1fr'},
          ]}
          data={scenarios}
        />
      </Table.Container>
    </section>,
    standalone,
  )
}

export function ExperimentsTable({
  experiments,
  headingLevel = 'h2',
  showViewAll = false,
  standalone = false,
}: ResourceTableProps & {
  experiments: Array<Experiment>
}) {
  return withStandaloneLayout(
    <section>
      <Table.Container>
        <Table.Title as={headingLevel} id="experiments-heading">
          Experiments
        </Table.Title>
        {showViewAll ? (
          <Table.Actions>
            <Link href="/experiments">View all</Link>
          </Table.Actions>
        ) : null}
        <DataTable
          aria-labelledby="experiments-heading"
          columns={[
            {
              id: 'name',
              header: 'Name',
              field: 'name',
              rowHeader: true,
              maxWidth: '40ch',
              renderCell: row => <Link href={`/experiments/${row.id}`}>{row.name}</Link>,
            },
            {id: 'description', header: 'Description', field: 'description', maxWidth: '60ch'},
            {id: 'models', header: 'Models', field: 'models', align: 'end'},
            {id: 'scenarios', header: 'Scenarios', field: 'scenarios', align: 'end'},
          ]}
          data={experiments.map(experiment => ({
            id: experiment.id,
            name: experiment.name,
            description: experiment.description,
            models: experiment.models.length,
            scenarios: experiment.scenarios.length,
          }))}
        />
      </Table.Container>
    </section>,
    standalone,
  )
}
