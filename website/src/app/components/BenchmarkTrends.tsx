'use client'

import {Button, FormControl, Heading, Select, Stack, Text} from '@primer/react'
import {DataTable, Table} from '@primer/react/experimental'
import {type MouseEvent, useState} from 'react'
import type {BenchmarkTrendMetricId, BenchmarkTrendPoint} from '../../benchmark-results'
import type {Benchmark} from '../../benchmarks'
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

type TrendTreatment = 'benchmark' | 'control'

function getSeriesName(point: BenchmarkTrendPoint): string {
  return point.reasoningEffort ? `${point.model} (${point.reasoningEffort})` : point.model
}

function formatChange(change: number | null): string {
  if (change === null) {
    return 'N/A'
  }

  return `${change > 0 ? '+' : ''}${numberFormatter.format(change)}%`
}

function formatAxisValue(metricId: BenchmarkTrendMetricId, value: number): string {
  if (metricId === 'tests') {
    return `${Math.round(value)}%`
  }

  if (metricId === 'sessionTime' || metricId === 'apiTime') {
    return `${numberFormatter.format(value)}s`
  }

  return numberFormatter.format(value)
}

function getAxisDomain(
  metricId: BenchmarkTrendMetricId,
  rawMin: number,
  rawMax: number,
): {
  min: number
  max: number
} {
  const range = rawMax - rawMin
  const margin = (range || Math.max(rawMax, 1)) * 0.1

  if (metricId !== 'tests') {
    return {
      min: Math.max(0, rawMin - margin),
      max: rawMax + margin,
    }
  }

  return {
    min: 0,
    max: 100,
  }
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
  points: Array<BenchmarkTrendPoint>
  series: Array<string>
  highlightedSeries: string | null
  highlightedTreatment: TrendTreatment | null
}) {
  const [activeTrend, setActiveTrend] = useState<{
    pointId: string
    treatment: TrendTreatment
  } | null>(null)
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
  const {min, max} = getAxisDomain(metric.id, rawMin, rawMax)
  const axisValues = metric.id === 'tests' ? [max, Math.round((max + min) / 2), min] : [max, (max + min) / 2, min]
  const getX = (date: string): number => {
    return padding.left + (dates.length === 1 ? plotWidth / 2 : (dates.indexOf(date) / (dates.length - 1)) * plotWidth)
  }
  const getY = (value: number): number => {
    return padding.top + (1 - (value - min) / (max - min)) * plotHeight
  }
  const activePoint = points.find(point => {
    return point.id === activeTrend?.pointId
  })
  const activeMetric = activePoint?.metrics[metric.id]
  const activeValue =
    activeTrend?.treatment === 'control'
      ? (activeMetric?.controlValue ?? undefined)
      : (activeMetric?.value ?? undefined)
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
  const controlOpacity = highlightedTreatment === 'benchmark' ? 0.15 : highlightedTreatment === 'control' ? 1 : 0.4
  const benchmarkOpacity = highlightedTreatment === 'control' ? 0.15 : 1
  const activateClosestPoint = (
    event: MouseEvent<SVGPathElement>,
    seriesPoints: Array<BenchmarkTrendPoint>,
    treatment: TrendTreatment,
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
        {axisValues.map(value => {
          const y = getY(value)
          return (
            <g key={value}>
              <line className={styles.gridLine} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className={styles.axisLabel} textAnchor="end" x={padding.left - 8} y={y + 4}>
                {formatAxisValue(metric.id, value)}
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
          const controlPoints = seriesPoints.filter(point => {
            return point.metrics[metric.id].controlValue !== null
          })
          const benchmarkPoints = seriesPoints.filter(point => {
            return point.metrics[metric.id].value !== null
          })
          const style = lineStyles[index % lineStyles.length]
          const controlPath = controlPoints
            .map((point, pointIndex) => {
              return `${pointIndex === 0 ? 'M' : 'L'} ${getX(point.date)} ${getY(
                point.metrics[metric.id].controlValue ?? 0,
              )}`
            })
            .join(' ')
          const benchmarkPath = benchmarkPoints
            .map((point, pointIndex) => {
              return `${pointIndex === 0 ? 'M' : 'L'} ${getX(point.date)} ${getY(point.metrics[metric.id].value ?? 0)}`
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
                    onBlur={() => {
                      setActiveTrend(null)
                    }}
                    onFocus={() => {
                      const pointId = controlPoints.at(-1)?.id
                      setActiveTrend(pointId ? {pointId, treatment: 'control'} : null)
                    }}
                    onMouseLeave={() => {
                      setActiveTrend(null)
                    }}
                    onMouseMove={event => {
                      activateClosestPoint(event, controlPoints, 'control')
                    }}
                    stroke="transparent"
                    strokeWidth="16"
                    tabIndex={0}
                  />
                </>
              ) : null}
              {benchmarkPoints.length > 0 ? (
                <>
                  <path
                    className={`${styles.seriesLine} ${styles.treatmentGroup}`}
                    d={benchmarkPath}
                    fill="none"
                    opacity={benchmarkOpacity}
                    stroke={style.color}
                    strokeDasharray={style.dash}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                  <path
                    aria-describedby={
                      activePoint && getSeriesName(activePoint) === seriesName && activeTrend?.treatment === 'benchmark'
                        ? tooltipId
                        : undefined
                    }
                    aria-label={`${seriesName}, Benchmark ${metric.label} trend`}
                    className={styles.lineHitTarget}
                    d={benchmarkPath}
                    fill="none"
                    onBlur={() => {
                      setActiveTrend(null)
                    }}
                    onFocus={() => {
                      const pointId = benchmarkPoints.at(-1)?.id
                      setActiveTrend(pointId ? {pointId, treatment: 'benchmark'} : null)
                    }}
                    onMouseLeave={() => {
                      setActiveTrend(null)
                    }}
                    onMouseMove={event => {
                      activateClosestPoint(event, benchmarkPoints, 'benchmark')
                    }}
                    stroke="transparent"
                    strokeWidth="16"
                    tabIndex={0}
                  />
                </>
              ) : null}
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
                    {value.value !== null ? (
                      <circle
                        className={styles.treatmentGroup}
                        cx={getX(point.date)}
                        cy={getY(value.value)}
                        fill="var(--bgColor-default)"
                        opacity={benchmarkOpacity}
                        r={activeTrend?.pointId === point.id && activeTrend.treatment === 'benchmark' ? '5' : '3.5'}
                        stroke={style.color}
                        strokeWidth="2"
                      />
                    ) : null}
                    {value.controlValue !== null ? (
                      <circle
                        className={styles.pointHitTarget}
                        cx={getX(point.date)}
                        cy={getY(value.controlValue)}
                        onMouseEnter={() => {
                          setActiveTrend({pointId: point.id, treatment: 'control'})
                        }}
                        onMouseLeave={() => {
                          setActiveTrend(null)
                        }}
                        r="10"
                      />
                    ) : null}
                    {value.value !== null ? (
                      <circle
                        className={styles.pointHitTarget}
                        cx={getX(point.date)}
                        cy={getY(value.value)}
                        onMouseEnter={() => {
                          setActiveTrend({pointId: point.id, treatment: 'benchmark'})
                        }}
                        onMouseLeave={() => {
                          setActiveTrend(null)
                        }}
                        r="10"
                      />
                    ) : null}
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
              {`${getSeriesName(activePoint)} - ${activeTrend?.treatment === 'control' ? 'Control' : 'Benchmark'}`}
            </text>
            <text className={styles.tooltipValue} x="10" y="40">
              {`${activePoint.date}: ${activeRaw}${
                activeTrend?.treatment === 'benchmark' ? ` (${formatChange(activeMetric.change)})` : ''
              }`}
            </text>
          </g>
        ) : null}
      </svg>
    </article>
  )
}

export function BenchmarkTrends({
  capabilities,
  points,
}: {
  capabilities: Benchmark['capabilities']
  points: Array<BenchmarkTrendPoint>
}) {
  const [tableMetricId, setTableMetricId] = useState<BenchmarkTrendMetricId>('tests')
  const [selectedCapabilityId, setSelectedCapabilityId] = useState('')
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null)
  const [selectedTreatment, setSelectedTreatment] = useState<TrendTreatment | null>(null)
  const [hoveredTreatment, setHoveredTreatment] = useState<TrendTreatment | null>(null)
  const scenarios = [
    ...new Set(
      (selectedCapabilityId
        ? (capabilities.find(capability => {
            return capability.name === selectedCapabilityId
          })?.scenarios ?? [])
        : capabilities.flatMap(capability => {
            return capability.scenarios
          })
      ).map(scenario => {
        return scenario.id
      }),
    ),
  ].toSorted()
  const filteredPoints = points.filter(point => {
    return point.capabilityId === (selectedCapabilityId || null) && point.scenarioId === (selectedScenarioId || null)
  })
  const dates = [
    ...new Set(
      filteredPoints.map(point => {
        return point.date
      }),
    ),
  ].toSorted()
  const series = [
    ...new Set(
      filteredPoints.map(point => {
        return getSeriesName(point)
      }),
    ),
  ].toSorted()
  const tableMetric =
    metrics.find(metric => {
      return metric.id === tableMetricId
    }) ?? metrics[0]
  const highlightedSeries = hoveredSeries ?? selectedSeries
  const highlightedTreatment = hoveredTreatment ?? selectedTreatment
  const comparisonRows = series.map(seriesName => {
    return {
      id: seriesName,
      model: seriesName,
      values: Object.fromEntries(
        dates.map(date => {
          const point = filteredPoints.find(candidate => {
            return getSeriesName(candidate) === seriesName && candidate.date === date
          })
          return [date, point?.metrics[tableMetric.id]]
        }),
      ),
    }
  })
  const rawRows = filteredPoints
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
        <div className={styles.trendsHeader}>
          <Stack gap="condensed">
            <Heading as="h2" id="benchmark-trends-heading">
              Trends
            </Heading>
            <Text as="p" className={styles.description}>
              Strong lines show Benchmark results and muted lines show Control over time.
            </Text>
          </Stack>
          <div className={styles.filters}>
            <FormControl>
              <FormControl.Label>Capability</FormControl.Label>
              <Select
                onChange={event => {
                  const capabilityId = event.currentTarget.value
                  const capabilityScenarios =
                    capabilities.find(capability => {
                      return capability.name === capabilityId
                    })?.scenarios ?? []
                  setSelectedCapabilityId(capabilityId)
                  if (
                    selectedScenarioId &&
                    !capabilityScenarios.some(scenario => {
                      return scenario.id === selectedScenarioId
                    })
                  ) {
                    setSelectedScenarioId('')
                  }
                }}
                value={selectedCapabilityId}
              >
                <Select.Option value="">All capabilities</Select.Option>
                {capabilities.map(capability => {
                  return (
                    <Select.Option key={capability.name} value={capability.name}>
                      {capability.name}
                    </Select.Option>
                  )
                })}
              </Select>
            </FormControl>
            <FormControl>
              <FormControl.Label>Scenario</FormControl.Label>
              <Select
                onChange={event => {
                  setSelectedScenarioId(event.currentTarget.value)
                }}
                value={selectedScenarioId}
              >
                <Select.Option value="">All scenarios</Select.Option>
                {scenarios.map(scenarioId => {
                  return (
                    <Select.Option key={scenarioId} value={scenarioId}>
                      {scenarioId}
                    </Select.Option>
                  )
                })}
              </Select>
            </FormControl>
          </div>
        </div>
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
                      onBlur={() => {
                        setHoveredSeries(null)
                      }}
                      onClick={() => {
                        setSelectedSeries(current => {
                          return current === seriesName ? null : seriesName
                        })
                      }}
                      onFocus={() => {
                        setHoveredSeries(seriesName)
                      }}
                      onMouseEnter={() => {
                        setHoveredSeries(seriesName)
                      }}
                      onMouseLeave={() => {
                        setHoveredSeries(null)
                      }}
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
                  aria-pressed={selectedTreatment === 'benchmark'}
                  className={styles.legendButton}
                  onBlur={() => {
                    setHoveredTreatment(null)
                  }}
                  onClick={() => {
                    setSelectedTreatment(current => {
                      return current === 'benchmark' ? null : 'benchmark'
                    })
                  }}
                  onFocus={() => {
                    setHoveredTreatment('benchmark')
                  }}
                  onMouseEnter={() => {
                    setHoveredTreatment('benchmark')
                  }}
                  onMouseLeave={() => {
                    setHoveredTreatment(null)
                  }}
                  size="small"
                  variant="invisible"
                >
                  <svg aria-hidden="true" height="8" width="28">
                    <line stroke="var(--fgColor-default)" strokeWidth="2" x1="0" x2="28" y1="4" y2="4" />
                  </svg>
                  Benchmark
                </Button>
              </li>
              <li>
                <Button
                  aria-pressed={selectedTreatment === 'control'}
                  className={styles.legendButton}
                  onBlur={() => {
                    setHoveredTreatment(null)
                  }}
                  onClick={() => {
                    setSelectedTreatment(current => {
                      return current === 'control' ? null : 'control'
                    })
                  }}
                  onFocus={() => {
                    setHoveredTreatment('control')
                  }}
                  onMouseEnter={() => {
                    setHoveredTreatment('control')
                  }}
                  onMouseLeave={() => {
                    setHoveredTreatment(null)
                  }}
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
            {metrics.map(metric => {
              return (
                <TrendChart
                  dates={dates}
                  highlightedSeries={highlightedSeries}
                  highlightedTreatment={highlightedTreatment}
                  key={metric.id}
                  metric={metric}
                  points={filteredPoints}
                  series={series}
                />
              )
            })}
          </div>
        </Stack>
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
