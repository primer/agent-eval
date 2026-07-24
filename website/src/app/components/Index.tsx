'use client'

import {DataTable, Table} from '@primer/react/experimental'
import type {Experiment} from '../../experiments'
import {Link} from '../../components/Link'

export function Index({experiments}: {experiments: Array<Experiment>}) {
  return (
    <div className="p-4">
      <section>
        <h1>Baseline</h1>
      </section>
      <section>
        <h2>Scenarios</h2>
      </section>
      <section>
        <Table.Container>
          <Table.Title as="h2" id="experiments-heading">
            Experiments
          </Table.Title>
          <Table.Actions>
            <Link href="/experiments">View all</Link>
          </Table.Actions>
          <DataTable
            aria-labelledby="experiments-heading"
            columns={[
              {
                id: 'name',
                header: 'Name',
                field: 'name',
                renderCell: cell => <Link href={`/experiments/${cell.id}`}>{cell.name}</Link>,
              },
              {id: 'description', header: 'Description', field: 'description', maxWidth: '60ch'},
              {id: 'models', header: 'Models', field: 'models'},
              {id: 'scenarios', header: 'Scenarios', field: 'scenarios'},
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
      </section>
    </div>
  )
}
