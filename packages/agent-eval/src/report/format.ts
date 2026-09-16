type TableRow = Record<string, string | number>

function formatDuration(ms: number): string {
  const seconds = ms / 1000

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds - minutes * 60
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercentDelta(control: number, treatment: number): string {
  if (control === treatment) {
    return '0%'
  }

  if (control === 0) {
    return 'N/A'
  }

  const delta = (treatment - control) / control
  const sign = delta > 0 ? '+' : ''
  return `${sign}${(delta * 100).toFixed(1)}%`
}

function formatCell(value: string | number | undefined): string {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ')
}

function formatTable(rows: Array<TableRow>, columns: Array<string>): string {
  const columnWidths = columns.map(column => {
    let width = column.length

    for (const row of rows) {
      width = Math.max(width, formatCell(row[column]).length)
    }

    return width
  })

  const formatRow = (row: TableRow): string => {
    return columns
      .map((column, index) => {
        return formatCell(row[column]).padEnd(columnWidths[index])
      })
      .join('  ')
      .trimEnd()
  }

  return [
    formatRow(
      Object.fromEntries(
        columns.map(column => {
          return [column, column]
        }),
      ),
    ),
    columnWidths
      .map(width => {
        return '-'.repeat(width)
      })
      .join('  '),
    ...rows.map(formatRow),
  ].join('\n')
}

export {formatDuration, formatNumber, formatPercentDelta, formatTable}
export type {TableRow}
