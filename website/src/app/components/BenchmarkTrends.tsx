'use client'

import {FormControl, Heading, Select, Stack, Text} from '@primer/react'
import {DataTable, Table} from '@primer/react/experimental'
import {useState} from 'react'
import type {BenchmarkTrendMetricId, BenchmarkTrendPoint} from '../../benchmark-results'
import styles from './BenchmarkTrends.module.css'

const metrics: Array<{
  id: BenchmarkTrendMetricId
  label: string
}> = [
  {id: 'tests', label: 'Tests passed'},
  {id: 'outputTokens', label: 'Output tokens'},
  {id: 'premiumRequests', label: 'Premium requests'},
  {id: 'sessionTime', label: 'Session time'},
  {id: 'apiTime', label: 'API time'},
]

const lineStyles = [
  {color: 'var(--data-blue-color-emphasis, var(--data-blue-color))', dash: undefined},
  {color: 'var(--data-green-color-emphasis, var(--data-green-color))', dash: '7 3'},
  {color: 'var(--data-orange-color-emphasis, var(--data-orange-color))', dash: '2 3'},
  {color: 'var(--data-pink-color-emphasis, var(--data-pink-color))', dash: '10 3 2 3'},
  {color: 'var(--data-yellow-color-emphasis, var(--data-yellow-color))', dash: '4 4'},
  {color: 'var(--data-red-color-emphasis, var(--data-red-color))', dash: '12 4'},
]

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

function getSeriesName(point: BenchmarkTrendPoint): string {
  return point.reasoningEffort ? `${point.model} (${point.reasoningEffort})` : point.model
}

function formatChange(change: number | null): string {
  if (change === null) {
    return 'N/A'
  }

  return `${change > 0 ? '+' : ''}${numberFormatter.format(change)}%`
}

function TrendChart({
  dates,
  metric,
  points,
  series,
}: {
  dates: Array<string>
  metric: (typeof metrics)[number]
  points: Array<BenchmarkTrendPoint>
  series: Array<string>
}) {
  const width = 520
  const height = 240
  const padding = {top: 16, right: 16, bottom: 52, left: 48}
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const values = points.flatMap(point => {
    const value = point.metrics[metric.id]
    return [value.value, value.controlValue].filter((item): item is number => {
      return item !== null
    })
  })
  const rawMin = values.length > 0 ? Math.min(...values) : 0
  const rawMax = values.length > 0 ? Math.max(...values) : 0
  const range = rawMax - rawMin
  const margin = (range || Math.max(rawMax, 1)) * 0.1
  const min = Math.max(0, rawMin - margin)
  const max = rawMax + margin
  const getX = (date: string): number => {
    return padding.left + (dates.length === 1 ? plotWidth / 2 : (dates.indexOf(date) / (dates.length - 1)) * plotWidth)
  }
  const getY = (value: number): number => {
    return padding.top + (1 - (value - min) / (max - min)) * plotHeight
  }

  return (
    <article className={styles.chart}>
      <Heading as="h3" variant="small">
        {metric.label}
      </Heading>
      <svg
        aria-label={`${metric.label} by model over time`}
        className={styles.chartSvg}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[max, (max + min) / 2, min].map(value => {
          const y = getY(value)
          return (
            <g key={value}>
              <line className={styles.gridLine} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className={styles.axisLabel} textAnchor="end" x={padding.left - 8} y={y + 4}>
                {numberFormatter.format(value)}
              </text>
            </g>
          )
        })}
        {dates.map(date => {
          return (
            <text className={styles.axisLabel} key={date} textAnchor="middle" x={getX(date)} y={height - 24}>
              {date.slice(5)}
            </text>
          )
        })}
        <text className={styles.axisLabel} textAnchor="middle" x={padding.left + plotWidth / 2} y={height - 4}>
          Run date
        </text>
        {series.map((seriesName, index) => {
          const seriesPoints = points
            .filter(point => {
              return getSeriesName(point) === seriesName
            })
            .toSorted((a, b) => {
              return a.date.localeCompare(b.date)
            })
          const style = lineStyles[index % lineStyles.length]

          return (
            <g key={seriesName}>
              {(['controlValue', 'value'] as const).map((valueKey, treatmentIndex) => {
                const treatmentPoints = seriesPoints.filter(point => {
                  return point.metrics[metric.id][valueKey] !== null
                })
                const path = treatmentPoints
                  .map((point, pointIndex) => {
                    const value = point.metrics[metric.id][valueKey] ?? 0
                    return `${pointIndex === 0 ? 'M' : 'L'} ${getX(point.date)} ${getY(value)}`
                  })
                  .join(' ')

                return (
                  <g key={valueKey} opacity={treatmentIndex === 0 ? 0.4 : 1}>
                    <path
                      className={styles.seriesLine}
                      d={path}
                      fill="none"
                      stroke={style.color}
                      strokeDasharray={style.dash}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={treatmentIndex === 0 ? '1.5' : '2'}
                    />
                    {treatmentPoints.map(point => {
                      const value = point.metrics[metric.id][valueKey] ?? 0
                      return (
                        <circle
                          cx={getX(point.date)}
                          cy={getY(value)}
                          fill="var(--bgColor-default)"
                          key={point.id}
                          r={treatmentIndex === 0 ? '3' : '3.5'}
                          stroke={style.color}
                          strokeWidth={treatmentIndex === 0 ? '1.5' : '2'}
                        >
                          <title>
                            {seriesName}, {treatmentIndex === 0 ? 'Control' : 'Benchmark'}, {point.date}:{' '}
                            {point.metrics[metric.id][treatmentIndex === 0 ? 'controlRaw' : 'raw']}
                          </title>
                        </circle>
                      )
                    })}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </article>
  )
}

export function BenchmarkTrends({points}: {points: Array<BenchmarkTrendPoint>}) {
  const [tableMetricId, setTableMetricId] = useState<BenchmarkTrendMetricId>('tests')
  const dates = [
    ...new Set(
      points.map(point => {
        return point.date
      }),
    ),
  ].toSorted()
  const series = [
    ...new Set(
      points.map(point => {
        return getSeriesName(point)
      }),
    ),
  ].toSorted()
  const tableMetric =
    metrics.find(metric => {
      return metric.id === tableMetricId
    }) ?? metrics[0]
  const comparisonRows = series.map(seriesName => {
    return {
      id: seriesName,
      model: seriesName,
      values: Object.fromEntries(
        dates.map(date => {
          const point = points.find(candidate => {
            return getSeriesName(candidate) === seriesName && candidate.date === date
          })
          return [date, point?.metrics[tableMetric.id]]
        }),
      ),
    }
  })
  const rawRows = points
    .toSorted((a, b) => {
      return a.date.localeCompare(b.date) || getSeriesName(a).localeCompare(getSeriesName(b))
    })
    .map(point => {
      return {...point, seriesName: getSeriesName(point)}
    })

  if (points.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="benchmark-trends-heading">
      <Stack gap="spacious">
        <Stack gap="condensed">
          <Heading as="h2" id="benchmark-trends-heading">
            Trends
          </Heading>
          <Text as="p" className={styles.description}>
            Strong lines show Benchmark results and muted lines show Control over time.
          </Text>
        </Stack>
        <ul className={styles.legend} aria-label="Model chart legend">
          {series.map((seriesName, index) => {
            const style = lineStyles[index % lineStyles.length]
            return (
              <li className={styles.legendItem} key={seriesName}>
                <svg aria-hidden="true" height="8" width="28">
                  <line
                    stroke={style.color}
                    strokeDasharray={style.dash}
                    strokeWidth="2"
                    x1="0"
                    x2="28"
                    y1="4"
                    y2="4"
                  />
                </svg>
                {seriesName}
              </li>
            )
          })}
        </ul>
        <div className={styles.chartGrid}>
          {metrics.map(metric => {
            return <TrendChart dates={dates} key={metric.id} metric={metric} points={points} series={series} />
          })}
        </div>
        <Table.Container>
          <Table.Title as="h3" id="benchmark-change-heading">
            Change from Control
          </Table.Title>
          <Table.Subtitle as="p" id="benchmark-change-description">
            Benchmark results are shown first, followed by the percent change from Control in parentheses.
          </Table.Subtitle>
          <Table.Actions>
            <FormControl>
              <FormControl.Label>Metric</FormControl.Label>
              <Select
                onChange={event => {
                  setTableMetricId(event.currentTarget.value as BenchmarkTrendMetricId)
                }}
                value={tableMetricId}
              >
                {metrics.map(metric => {
                  return (
                    <Select.Option key={metric.id} value={metric.id}>
                      {metric.label}
                    </Select.Option>
                  )
                })}
              </Select>
            </FormControl>
          </Table.Actions>
          <DataTable
            aria-describedby="benchmark-change-description"
            aria-labelledby="benchmark-change-heading"
            cellPadding="condensed"
            columns={[
              {
                id: 'model',
                header: 'Model',
                field: 'model',
                rowHeader: true,
              },
              ...dates.map(date => {
                return {
                  id: date,
                  header: () => {
                    return <time dateTime={date}>{date}</time>
                  },
                  field: 'values' as const,
                  align: 'end' as const,
                  renderCell: (row: (typeof comparisonRows)[number]) => {
                    const value = row.values[date]
                    return value ? (
                      <span className={styles.metricValue}>
                        {value.raw} <span className={styles.change}>({formatChange(value.change)})</span>
                      </span>
                    ) : (
                      'N/A'
                    )
                  },
                }
              }),
            ]}
            data={comparisonRows}
          />
        </Table.Container>
        <details className={styles.details}>
          <summary className={styles.summary} id="raw-benchmark-trend-data-heading">
            View raw trend data
          </summary>
          <div className={styles.rawData}>
            <DataTable
              aria-labelledby="raw-benchmark-trend-data-heading"
              cellPadding="condensed"
              columns={[
                {
                  id: 'date',
                  header: 'Date',
                  field: 'date',
                  renderCell: row => {
                    return <time dateTime={row.date}>{row.date}</time>
                  },
                },
                {
                  id: 'model',
                  header: 'Model',
                  field: 'seriesName',
                  rowHeader: true,
                },
                ...metrics.map(metric => {
                  return {
                    id: metric.id,
                    header: metric.label,
                    field: 'metrics' as const,
                    align: 'end' as const,
                    renderCell: (row: (typeof rawRows)[number]) => {
                      const value = row.metrics[metric.id]
                      return (
                        <span className={styles.metricValue}>
                          {value.raw} <span className={styles.change}>({formatChange(value.change)})</span>
                        </span>
                      )
                    },
                  }
                }),
              ]}
              data={rawRows}
            />
          </div>
        </details>
      </Stack>
    </section>
  )
}
