'use client'

import {Heading, Stack} from '@primer/react'
import {DataTable, Table, Blankslate} from '@primer/react/experimental'
import type {Experiment} from '../../experiments'
import {Link} from '../../components/Link'
import type {Run} from '../../runs'
import type {Scenario} from '../../scenarios'

export function Index({
  experiments,
  latestRun,
  scenarios,
}: {
  experiments: Array<Experiment>
  latestRun: Run | null
  scenarios: Array<Scenario>
}) {
  return (
    <Stack padding="normal" gap="spacious">
      <section>
        <h1 className="text-title-medium pb-4">Baseline</h1>
        {latestRun ? null : (
          <Blankslate border>
            <Blankslate.Heading>No results</Blankslate.Heading>
            <Blankslate.Description>
              No baseline results have been recorded yet. Run the baseline tests to see results here.
            </Blankslate.Description>
          </Blankslate>
        )}
      </section>
      <section>
        <Table.Container>
          <Table.Title as="h2" id="scenarios-heading">
            Scenarios
          </Table.Title>
          <Table.Actions>
            <Link href="/scenarios">View all</Link>
          </Table.Actions>
          <DataTable
            aria-labelledby="scenarios-heading"
            columns={[
              {
                id: 'id',
                header: 'ID',
                field: 'id',
                maxWidth: '40ch',
                renderCell: cell => <Link href={`/scenarios/${cell.id}`}>{cell.id}</Link>,
              },
              {id: 'prompt', header: 'Prompt', field: 'prompt', maxWidth: '1fr'},
            ]}
            data={scenarios}
          />
        </Table.Container>
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
                maxWidth: '40ch',
                renderCell: cell => <Link href={`/experiments/${cell.id}`}>{cell.name}</Link>,
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
      </section>
    </Stack>
  )
}
