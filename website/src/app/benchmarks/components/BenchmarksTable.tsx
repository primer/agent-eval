'use client'

import {Blankslate, DataTable, Table} from '@primer/react/experimental'
import {Link} from '../../components/Link'

type BenchmarksTableProps = {
  benchmarks: Array<{
    id: string
    name: string
  }>
}

export function BenchmarksTable({benchmarks}: BenchmarksTableProps) {
  return (
    <>
      <Table.Container>
        <DataTable
          aria-labelledby="benchmarks-page-heading"
          data={benchmarks}
          columns={[
            {
              header: 'Name',
              field: 'name',
              renderCell: row => {
                return <Link href={`/benchmarks/${row.id}`}>{row.name}</Link>
              },
            },
          ]}
        />
      </Table.Container>
    </>
  )
}
