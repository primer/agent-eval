'use client'

import {Button, FormControl, Heading, Select, Stack, Text} from '@primer/react'
import {DataTable, Table} from '@primer/react/experimental'
import {type MouseEvent, useState} from 'react'
import styles from './BaselineTrends.module.css'

type BaselineTrendMetric = {
  value: number
  raw: string
  change: number | null
  controlValue: number | null
  controlRaw: string | null
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
  highlightedSeries,
  highlightedTreatment,
}: {
  dates: Array<string>
  metric: (typeof metrics)[number]
  points: Array<BaselineTrendPoint>
  series: Array<string>
  highlightedSeries: string | null
  highlightedTreatment: 'recommended' | 'control' | null
}) {
  const [activeTrend, setActiveTrend] = useState<{
    pointId: string
    treatment: 'recommended' | 'control'
  } | null>(null)
  const width = 520
  const height = 240
  const padding = {top: 16, right: 16, bottom: 52, left: 48}
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const values = points.flatMap(point => {
    const value = point.metrics[metric.id]
    return value.controlValue === null ? [value.value] : [value.value, value.controlValue]
  })
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const range = rawMax - rawMin
  const min = Math.max(0, rawMin - (range || Math.max(rawMax, 1)) * 0.1)
  const max = rawMax + (range || Math.max(rawMax, 1)) * 0.1
  const getX = (date: string) =>
    padding.left + (dates.length === 1 ? plotWidth / 2 : (dates.indexOf(date) / (dates.length - 1)) * plotWidth)
  const getY = (value: number) => padding.top + (1 - (value - min) / (max - min)) * plotHeight
  const activePoint = points.find(point => point.id === activeTrend?.pointId)
  const activeMetric = activePoint?.metrics[metric.id]
  const activeValue =
    activeTrend?.treatment === 'control' ? (activeMetric?.controlValue ?? undefined) : activeMetric?.value
  const activeRaw = activeTrend?.treatment === 'control' ? activeMetric?.controlRaw : activeMetric?.raw
  const tooltipWidth = 248
  const tooltipHeight = 52
  const tooltipX = activePoint
    ? Math.min(Math.max(getX(activePoint.date) - tooltipWidth / 2, padding.left), width - padding.right - tooltipWidth)
    : 0
  const tooltipY =
    activePoint && activeValue !== undefined
      ? Math.max(padding.top, Math.min(getY(activeValue) - tooltipHeight - 10, height - padding.bottom - tooltipHeight))
      : 0
  const tooltipId = `${metric.id}-chart-tooltip`
  const controlOpacity = highlightedTreatment === 'recommended' ? 0.15 : highlightedTreatment === 'control' ? 1 : 0.4
  const recommendedOpacity = highlightedTreatment === 'control' ? 0.15 : 1
  const activateClosestPoint = (
    event: MouseEvent<SVGPathElement>,
    seriesPoints: Array<BaselineTrendPoint>,
    treatment: 'recommended' | 'control',
  ) => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg || seriesPoints.length === 0) {
      return
    }

    const bounds = svg.getBoundingClientRect()
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width
    const closestPoint = seriesPoints.reduce((closest, point) => {
      return Math.abs(getX(point.date) - pointerX) < Math.abs(getX(closest.date) - pointerX) ? point : closest
    })
    setActiveTrend({pointId: closestPoint.id, treatment})
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
          const controlPoints = seriesPoints.filter(point => point.metrics[metric.id].controlValue !== null)
          const style = lineStyles[index % lineStyles.length]
          const recommendedPath = seriesPoints
            .map((point, pointIndex) => {
              return `${pointIndex === 0 ? 'M' : 'L'} ${getX(point.date)} ${getY(point.metrics[metric.id].value)}`
            })
            .join(' ')
          const controlPath = controlPoints
            .map((point, pointIndex) => {
              return `${pointIndex === 0 ? 'M' : 'L'} ${getX(point.date)} ${getY(
                point.metrics[metric.id].controlValue ?? 0,
              )}`
            })
            .join(' ')

          return (
            <g
              className={styles.seriesGroup}
              key={seriesName}
              opacity={highlightedSeries && highlightedSeries !== seriesName ? 0.15 : 1}
            >
              {controlPoints.length > 0 ? (
                <>
                  <path
                    className={`${styles.controlLine} ${styles.treatmentGroup}`}
                    d={controlPath}
                    fill="none"
                    opacity={controlOpacity}
                    stroke={style.color}
                    strokeDasharray={style.dash}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                  <path
                    aria-describedby={
                      activePoint && getSeriesName(activePoint) === seriesName && activeTrend?.treatment === 'control'
                        ? tooltipId
                        : undefined
                    }
                    aria-label={`${seriesName}, Control ${metric.label} trend`}
                    className={styles.lineHitTarget}
                    d={controlPath}
                    fill="none"
                    onBlur={() => setActiveTrend(null)}
                    onFocus={() => {
                      const pointId = controlPoints.at(-1)?.id
                      setActiveTrend(pointId ? {pointId, treatment: 'control'} : null)
                    }}
                    onMouseLeave={() => setActiveTrend(null)}
                    onMouseMove={event => activateClosestPoint(event, controlPoints, 'control')}
                    stroke="transparent"
                    strokeWidth="16"
                    tabIndex={0}
                  />
                </>
              ) : null}
              <path
                className={`${styles.seriesLine} ${styles.treatmentGroup}`}
                d={recommendedPath}
                fill="none"
                opacity={recommendedOpacity}
                stroke={style.color}
                strokeDasharray={style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
              <path
                aria-describedby={
                  activePoint && getSeriesName(activePoint) === seriesName && activeTrend?.treatment === 'recommended'
                    ? tooltipId
                    : undefined
                }
                aria-label={`${seriesName}, Recommended ${metric.label} trend`}
                className={styles.lineHitTarget}
                d={recommendedPath}
                fill="none"
                onBlur={() => setActiveTrend(null)}
                onFocus={() => {
                  const pointId = seriesPoints.at(-1)?.id
                  setActiveTrend(pointId ? {pointId, treatment: 'recommended'} : null)
                }}
                onMouseLeave={() => setActiveTrend(null)}
                onMouseMove={event => activateClosestPoint(event, seriesPoints, 'recommended')}
                stroke="transparent"
                strokeWidth="16"
                tabIndex={0}
              />
              {seriesPoints.map(point => {
                const value = point.metrics[metric.id]
                return (
                  <g aria-hidden="true" key={point.id}>
                    {value.controlValue !== null ? (
                      <circle
                        className={`${styles.controlPoint} ${styles.treatmentGroup}`}
                        cx={getX(point.date)}
                        cy={getY(value.controlValue)}
                        fill="var(--bgColor-default)"
                        opacity={controlOpacity}
                        r={activeTrend?.pointId === point.id && activeTrend.treatment === 'control' ? '4.5' : '3'}
                        stroke={style.color}
                        strokeWidth="1.5"
                      />
                    ) : null}
                    <circle
                      className={styles.treatmentGroup}
                      cx={getX(point.date)}
                      cy={getY(value.value)}
                      fill="var(--bgColor-default)"
                      opacity={recommendedOpacity}
                      r={activeTrend?.pointId === point.id && activeTrend.treatment === 'recommended' ? '5' : '3.5'}
                      stroke={style.color}
                      strokeWidth="2"
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
        {activePoint && activeMetric && activeRaw ? (
          <g className={styles.tooltip} id={tooltipId} role="tooltip" transform={`translate(${tooltipX} ${tooltipY})`}>
            <rect className={styles.tooltipBackground} height={tooltipHeight} width={tooltipWidth} />
            <text className={styles.tooltipTitle} x="10" y="20">
              {getSeriesName(activePoint)} · {activeTrend?.treatment === 'control' ? 'Control' : 'Recommended'}
            </text>
            <text className={styles.tooltipValue} x="10" y="40">
              {activePoint.date}: {activeRaw}
              {activeTrend?.treatment === 'recommended' ? ` (${formatChange(activeMetric.change)})` : ''}
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
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null)
  const [selectedTreatment, setSelectedTreatment] = useState<'recommended' | 'control' | null>(null)
  const [hoveredTreatment, setHoveredTreatment] = useState<'recommended' | 'control' | null>(null)
  const scenarioPoints = points.filter(point => point.scenarioId === scenarioId)
  const dates = [...new Set(scenarioPoints.map(point => point.date))].toSorted()
  const series = [...new Set(scenarioPoints.map(getSeriesName))].toSorted()
  const heatmapMetric = metrics.find(metric => metric.id === heatmapMetricId) ?? metrics[0]
  const highlightedSeries = hoveredSeries ?? selectedSeries
  const highlightedTreatment = hoveredTreatment ?? selectedTreatment
  const rawTrendRows = scenarioPoints
    .toSorted((a, b) => a.date.localeCompare(b.date) || getSeriesName(a).localeCompare(getSeriesName(b)))
    .map(point => ({
      ...point,
      seriesName: getSeriesName(point),
    }))

  if (scenarioPoints.length === 0) {
    return null
  }

  return (
    <section className={styles.section} aria-labelledby="baseline-trends-heading">
      <Stack gap="spacious">
        <Stack gap="condensed">
          <Heading as="h2" id="baseline-trends-heading">
            Trends
          </Heading>
          <Text as="p" className={styles.description}>
            Strong lines show Recommended results and muted lines show Control over time. The comparison table shows
            each Recommended result relative to Control.
          </Text>
        </Stack>
        <Stack gap="normal">
          <div className={styles.legendGroups}>
            <ul className={styles.legend} aria-label="Model chart legend">
              {series.map((seriesName, index) => {
                const style = lineStyles[index % lineStyles.length]
                return (
                  <li key={seriesName}>
                    <Button
                      aria-pressed={selectedSeries === seriesName}
                      className={styles.legendButton}
                      onBlur={() => setHoveredSeries(null)}
                      onClick={() => setSelectedSeries(current => (current === seriesName ? null : seriesName))}
                      onFocus={() => setHoveredSeries(seriesName)}
                      onMouseEnter={() => setHoveredSeries(seriesName)}
                      onMouseLeave={() => setHoveredSeries(null)}
                      size="small"
                      variant="invisible"
                    >
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
                    </Button>
                  </li>
                )
              })}
            </ul>
            <ul className={styles.treatmentLegend} aria-label="Treatment chart legend">
              <li>
                <Button
                  aria-pressed={selectedTreatment === 'recommended'}
                  className={styles.legendButton}
                  onBlur={() => setHoveredTreatment(null)}
                  onClick={() => setSelectedTreatment(current => (current === 'recommended' ? null : 'recommended'))}
                  onFocus={() => setHoveredTreatment('recommended')}
                  onMouseEnter={() => setHoveredTreatment('recommended')}
                  onMouseLeave={() => setHoveredTreatment(null)}
                  size="small"
                  variant="invisible"
                >
                  <svg aria-hidden="true" height="8" width="28">
                    <line stroke="var(--fgColor-default)" strokeWidth="2" x1="0" x2="28" y1="4" y2="4" />
                  </svg>
                  Recommended
                </Button>
              </li>
              <li>
                <Button
                  aria-pressed={selectedTreatment === 'control'}
                  className={styles.legendButton}
                  onBlur={() => setHoveredTreatment(null)}
                  onClick={() => setSelectedTreatment(current => (current === 'control' ? null : 'control'))}
                  onFocus={() => setHoveredTreatment('control')}
                  onMouseEnter={() => setHoveredTreatment('control')}
                  onMouseLeave={() => setHoveredTreatment(null)}
                  size="small"
                  variant="invisible"
                >
                  <svg aria-hidden="true" height="8" width="28">
                    <line
                      opacity="0.4"
                      stroke="var(--fgColor-default)"
                      strokeWidth="1.5"
                      x1="0"
                      x2="28"
                      y1="4"
                      y2="4"
                    />
                  </svg>
                  Control
                </Button>
              </li>
            </ul>
          </div>
          <div className={styles.chartGrid}>
            {metrics.map(metric => (
              <TrendChart
                dates={dates}
                highlightedSeries={highlightedSeries}
                highlightedTreatment={highlightedTreatment}
                key={metric.id}
                metric={metric}
                points={scenarioPoints}
                series={series}
              />
            ))}
          </div>
        </Stack>
        <Stack gap="normal">
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
        </Stack>
      </Stack>
    </section>
  )
}
