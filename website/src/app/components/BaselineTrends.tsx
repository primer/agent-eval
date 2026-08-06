'use client'

import {FormControl, Heading, Select, Stack, Text} from '@primer/react'
import {DataTable, Table} from '@primer/react/experimental'
import {useState} from 'react'
import styles from './BaselineTrends.module.css'

type BaselineTrendMetric = {
  value: number
  raw: string
  change: number | null
}

type BaselineTrendMetricId =
  'tests' | 'turns' | 'outputTokens' | 'premiumRequests' | 'apiDuration' | 'sessionDuration' | 'toolCalls'

export type BaselineTrendPoint = {
  id: string
  date: string
  scenarioId: string
  model: string
  reasoningEffort: string
  metrics: Record<BaselineTrendMetricId, BaselineTrendMetric>
}

const metrics: Array<{
  id: BaselineTrendMetricId
  label: string
}> = [
  {id: 'tests', label: 'Tests passed'},
  {id: 'turns', label: 'Turns'},
  {id: 'outputTokens', label: 'Output tokens'},
  {id: 'premiumRequests', label: 'Premium requests'},
  {id: 'apiDuration', label: 'API time'},
  {id: 'sessionDuration', label: 'Session time'},
  {id: 'toolCalls', label: 'Tool calls'},
]

const lineStyles = [
  {color: 'var(--data-blue-color-emphasis, var(--data-blue-color))', dash: undefined},
  {color: 'var(--data-green-color-emphasis, var(--data-green-color))', dash: '7 3'},
  {color: 'var(--data-orange-color-emphasis, var(--data-orange-color))', dash: '2 3'},
  {color: 'var(--data-pink-color-emphasis, var(--data-pink-color))', dash: '10 3 2 3'},
  {color: 'var(--data-yellow-color-emphasis, var(--data-yellow-color))', dash: '4 4'},
  {color: 'var(--data-red-color-emphasis, var(--data-red-color))', dash: '12 4'},
]

const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

function getSeriesName(point: BaselineTrendPoint) {
  return point.reasoningEffort === '—' ? point.model : `${point.model} (${point.reasoningEffort})`
}

function formatChange(change: number | null) {
  if (change === null) {
    return '—'
  }

  return `${change > 0 ? '+' : ''}${percentFormatter.format(change)}%`
}

function TrendChart({
  dates,
  metric,
  points,
  series,
}: {
  dates: Array<string>
  metric: (typeof metrics)[number]
  points: Array<BaselineTrendPoint>
  series: Array<string>
}) {
  const [activePointId, setActivePointId] = useState<string | null>(null)
  const width = 520
  const height = 240
  const padding = {top: 16, right: 16, bottom: 52, left: 48}
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const values = points.map(point => point.metrics[metric.id].value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const range = rawMax - rawMin
  const min = Math.max(0, rawMin - (range || Math.max(rawMax, 1)) * 0.1)
  const max = rawMax + (range || Math.max(rawMax, 1)) * 0.1
  const getX = (date: string) =>
    padding.left + (dates.length === 1 ? plotWidth / 2 : (dates.indexOf(date) / (dates.length - 1)) * plotWidth)
  const getY = (value: number) => padding.top + (1 - (value - min) / (max - min)) * plotHeight
  const activePoint = points.find(point => point.id === activePointId)
  const tooltipWidth = 248
  const tooltipHeight = 52
  const tooltipX = activePoint
    ? Math.min(Math.max(getX(activePoint.date) - tooltipWidth / 2, padding.left), width - padding.right - tooltipWidth)
    : 0
  const tooltipY = activePoint
    ? Math.max(
        padding.top,
        Math.min(
          getY(activePoint.metrics[metric.id].value) - tooltipHeight - 10,
          height - padding.bottom - tooltipHeight,
        ),
      )
    : 0
  const tooltipId = `${metric.id}-chart-tooltip`

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
        {dates.map(date => (
          <text className={styles.axisLabel} key={date} textAnchor="middle" x={getX(date)} y={height - 24}>
            {date.slice(5)}
          </text>
        ))}
        <text className={styles.axisLabel} textAnchor="middle" x={padding.left + plotWidth / 2} y={height - 4}>
          Run date
        </text>
        {series.map((seriesName, index) => {
          const seriesPoints = points
            .filter(point => getSeriesName(point) === seriesName)
            .toSorted((a, b) => a.date.localeCompare(b.date))
          const style = lineStyles[index % lineStyles.length]
          const path = seriesPoints
            .map((point, pointIndex) => {
              const x = getX(point.date)
              const y = getY(point.metrics[metric.id].value)
              return `${pointIndex === 0 ? 'M' : 'L'} ${x} ${y}`
            })
            .join(' ')

          return (
            <g key={seriesName}>
              <path
                className={styles.seriesLine}
                d={path}
                fill="none"
                stroke={style.color}
                strokeDasharray={style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
              <path
                aria-describedby={activePoint && getSeriesName(activePoint) === seriesName ? tooltipId : undefined}
                aria-label={`${seriesName}, ${metric.label} trend`}
                className={styles.lineHitTarget}
                d={path}
                fill="none"
                onBlur={() => setActivePointId(null)}
                onFocus={() => setActivePointId(seriesPoints.at(-1)?.id ?? null)}
                onMouseLeave={() => setActivePointId(null)}
                onMouseMove={event => {
                  const svg = event.currentTarget.ownerSVGElement
                  if (!svg) {
                    return
                  }

                  const bounds = svg.getBoundingClientRect()
                  const pointerX = ((event.clientX - bounds.left) / bounds.width) * width
                  const closestPoint = seriesPoints.reduce((closest, point) => {
                    return Math.abs(getX(point.date) - pointerX) < Math.abs(getX(closest.date) - pointerX)
                      ? point
                      : closest
                  })
                  setActivePointId(closestPoint.id)
                }}
                stroke="transparent"
                strokeWidth="16"
                tabIndex={0}
              />
              {seriesPoints.map(point => {
                return (
                  <circle
                    aria-hidden="true"
                    cx={getX(point.date)}
                    cy={getY(point.metrics[metric.id].value)}
                    fill="var(--bgColor-default)"
                    key={point.id}
                    r={activePointId === point.id ? '5' : '3.5'}
                    stroke={style.color}
                    strokeWidth="2"
                  />
                )
              })}
            </g>
          )
        })}
        {activePoint ? (
          <g className={styles.tooltip} id={tooltipId} role="tooltip" transform={`translate(${tooltipX} ${tooltipY})`}>
            <rect className={styles.tooltipBackground} height={tooltipHeight} width={tooltipWidth} />
            <text className={styles.tooltipTitle} x="10" y="20">
              {getSeriesName(activePoint)}
            </text>
            <text className={styles.tooltipValue} x="10" y="40">
              {activePoint.date}: {activePoint.metrics[metric.id].raw} (
              {formatChange(activePoint.metrics[metric.id].change)})
            </text>
          </g>
        ) : null}
      </svg>
    </article>
  )
}

function ControlTable({
  dates,
  metric,
  points,
  series,
}: {
  dates: Array<string>
  metric: (typeof metrics)[number]
  points: Array<BaselineTrendPoint>
  series: Array<string>
}) {
  const rows = series.map(seriesName => ({
    id: seriesName,
    model: seriesName,
    values: Object.fromEntries(
      dates.map(date => {
        const point = points.find(item => getSeriesName(item) === seriesName && item.date === date)
        return [date, point?.metrics[metric.id]]
      }),
    ),
  }))

  return (
    <DataTable
      aria-labelledby="baseline-heatmap-heading"
      aria-describedby="baseline-heatmap-description"
      cellPadding="condensed"
      columns={[
        {
          id: 'model',
          header: 'Model',
          field: 'model',
          rowHeader: true,
        },
        ...dates.map(date => ({
          id: date,
          header: () => <time dateTime={date}>{date}</time>,
          field: 'values' as const,
          align: 'end' as const,
          renderCell: (row: (typeof rows)[number]) => {
            const value = row.values[date]

            return value ? (
              <span className={styles.metricValue}>
                {value.raw} <span className={styles.change}>({formatChange(value.change)})</span>
              </span>
            ) : (
              '—'
            )
          },
        })),
      ]}
      data={rows}
    />
  )
}

export function BaselineTrends({points, scenarioId}: {points: Array<BaselineTrendPoint>; scenarioId: string}) {
  const [heatmapMetricId, setHeatmapMetricId] = useState<BaselineTrendMetricId>('tests')
  const scenarioPoints = points.filter(point => point.scenarioId === scenarioId)
  const dates = [...new Set(scenarioPoints.map(point => point.date))].toSorted()
  const series = [...new Set(scenarioPoints.map(getSeriesName))].toSorted()
  const heatmapMetric = metrics.find(metric => metric.id === heatmapMetricId) ?? metrics[0]
  const rawTrendRows = scenarioPoints
    .toSorted((a, b) => a.date.localeCompare(b.date) || getSeriesName(a).localeCompare(getSeriesName(b)))
    .map(point => ({
      ...point,
      seriesName: getSeriesName(point),
    }))

  if (points.length === 0) {
    return null
  }

  return (
    <section className={styles.section} aria-labelledby="baseline-trends-heading">
      <Heading as="h2" id="baseline-trends-heading">
        Trends
      </Heading>
      <Text as="p" className={styles.description}>
        Lines show raw Recommended results over time. The comparison table shows each result relative to Control.
      </Text>
      <Stack gap="normal">
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
          {metrics.map(metric => (
            <TrendChart dates={dates} key={metric.id} metric={metric} points={scenarioPoints} series={series} />
          ))}
        </div>
        <Table.Container>
          <Table.Title as="h3" id="baseline-heatmap-heading">
            Change from Control
          </Table.Title>
          <Table.Subtitle as="p" id="baseline-heatmap-description">
            Recommended results are shown first, followed by the percent change from Control in parentheses.
          </Table.Subtitle>
          <Table.Actions>
            <FormControl>
              <FormControl.Label>Metric</FormControl.Label>
              <Select
                onChange={event => setHeatmapMetricId(event.currentTarget.value as BaselineTrendMetricId)}
                value={heatmapMetricId}
              >
                {metrics.map(metric => (
                  <Select.Option key={metric.id} value={metric.id}>
                    {metric.label}
                  </Select.Option>
                ))}
              </Select>
            </FormControl>
          </Table.Actions>
          <ControlTable dates={dates} metric={heatmapMetric} points={scenarioPoints} series={series} />
        </Table.Container>
      </Stack>
      <details className={styles.details}>
        <summary className={styles.summary} id="raw-trend-data-heading">
          View raw trend data
        </summary>
        <div className={styles.rawData}>
          <DataTable
            aria-labelledby="raw-trend-data-heading"
            cellPadding="condensed"
            columns={[
              {
                id: 'date',
                header: 'Date',
                field: 'date',
                renderCell: row => <time dateTime={row.date}>{row.date}</time>,
              },
              {
                id: 'model',
                header: 'Model',
                field: 'seriesName',
                rowHeader: true,
              },
              ...metrics.map(metric => ({
                id: metric.id,
                header: metric.label,
                field: 'metrics' as const,
                align: 'end' as const,
                renderCell: (row: (typeof rawTrendRows)[number]) => {
                  const value = row.metrics[metric.id]
                  return (
                    <span className={styles.metricValue}>
                      {value.raw} <span className={styles.change}>({formatChange(value.change)})</span>
                    </span>
                  )
                },
              })),
            ]}
            data={rawTrendRows}
          />
        </div>
      </details>
    </section>
  )
}
