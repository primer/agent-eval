'use client'

import {Button, FormControl, Select} from '@primer/react'
import {DataTable, Table} from '@primer/react/experimental'
import type {Route} from 'next'
import {useId, useState} from 'react'
import type {BenchmarkExperimentResults, TreatmentMetrics} from '../../benchmark-experiment-results'
import {Link} from '../../components/Link'
import {getCapabilityScenarioAnchor} from '../../scenario-anchor'

type MatrixRow = {
  id: string
  name: string
  scenarioCount: number
  treatments: Array<TreatmentMetrics>
}

export function BenchmarkExperimentMatrix({
  experimentId,
  date,
  results,
}: {
  experimentId: string
  date: string
  results: BenchmarkExperimentResults
}) {
  const headingId = useId()
  const [variantId, setVariantId] = useState(results.variants[0]?.id ?? '')
  const [metricId, setMetricId] = useState(results.metrics[0]?.id ?? '')
  const references = results.treatments.filter(treatment => {
    return treatment.name === 'Control' || treatment.name === 'Benchmark'
  })
  const [referenceId, setReferenceId] = useState(
    references.find(reference => {
      return reference.name === 'Benchmark'
    })?.id ??
      references[0]?.id ??
      '',
  )
  const [capabilityId, setCapabilityId] = useState('')
  const variant = results.variants.find(candidate => {
    return candidate.id === variantId
  })
  const capability = results.capabilities.find(candidate => {
    return candidate.id === capabilityId
  })

  function changeVariant(field: 'model' | 'reasoningEffort' | 'runner', value: string) {
    const candidates = results.variants.filter(candidate => {
      return (
        candidate[field] === value &&
        (field === 'model' || candidate.model === variant?.model) &&
        (field !== 'runner' || candidate.reasoningEffort === variant?.reasoningEffort)
      )
    })
    const next =
      candidates.find(candidate => {
        return (
          (field === 'reasoningEffort' || candidate.reasoningEffort === variant?.reasoningEffort) &&
          (field === 'runner' || candidate.runner === variant?.runner)
        )
      }) ?? candidates[0]
    if (next) {
      setVariantId(next.id)
    }
  }

  function renderMetric(row: MatrixRow, treatmentId: string) {
    const treatment = row.treatments.find(candidate => {
      return candidate.treatmentId === treatmentId && candidate.variantId === variantId
    })
    const metric = treatment?.metrics[metricId]
    if (!treatment || !metric) {
      return <span>N/A (no trials)</span>
    }
    return (
      <div className="flex flex-col gap-1">
        <span>
          {treatmentId === referenceId ? metric.raw : (metric.comparisons[referenceId] ?? `${metric.raw} (N/A)`)}
        </span>
        <span className="text-caption text-muted">
          {treatment.trials} trials / {treatment.scenarios} scenarios
        </span>
      </div>
    )
  }

  const treatmentColumns = results.treatments.map(treatment => {
    return {
      id: treatment.id,
      header: treatment.name,
      field: 'treatments' as const,
      renderCell: (row: MatrixRow) => {
        return renderMetric(row, treatment.id)
      },
    }
  })
  const models = [
    ...new Set(
      results.variants.map(candidate => {
        return candidate.model
      }),
    ),
  ]
  const efforts = [
    ...new Set(
      results.variants
        .filter(candidate => {
          return candidate.model === variant?.model
        })
        .map(candidate => {
          return candidate.reasoningEffort
        }),
    ),
  ]
  const runners = [
    ...new Set(
      results.variants
        .filter(candidate => {
          return candidate.model === variant?.model && candidate.reasoningEffort === variant?.reasoningEffort
        })
        .map(candidate => {
          return candidate.runner
        }),
    ),
  ]

  return (
    <section className="flex flex-col gap-4" aria-labelledby={headingId}>
      <h2 className="text-title-medium" id={headingId}>
        Capability performance
      </h2>
      <p>
        Benchmark: <Link href={`/benchmarks/${results.id}` as Route}>{results.name}</Link>. Run:{' '}
        <Link href={`/experiments/${experimentId}/runs/${date}` as Route}>
          <time dateTime={date}>{date}</time>
        </Link>
      </p>
      <div className="flex flex-wrap gap-3">
        {variant ? (
          <>
            <FormControl>
              <FormControl.Label>Model</FormControl.Label>
              <Select
                value={variant.model}
                onChange={event => {
                  changeVariant('model', event.currentTarget.value)
                }}
              >
                {models.map(model => {
                  return (
                    <Select.Option key={model} value={model}>
                      {model}
                    </Select.Option>
                  )
                })}
              </Select>
            </FormControl>
            <FormControl>
              <FormControl.Label>Reasoning effort</FormControl.Label>
              <Select
                value={variant.reasoningEffort}
                onChange={event => {
                  changeVariant('reasoningEffort', event.currentTarget.value)
                }}
              >
                {efforts.map(effort => {
                  return (
                    <Select.Option key={effort} value={effort}>
                      {effort}
                    </Select.Option>
                  )
                })}
              </Select>
            </FormControl>
            <FormControl>
              <FormControl.Label>Runner</FormControl.Label>
              <Select
                value={variant.runner}
                onChange={event => {
                  changeVariant('runner', event.currentTarget.value)
                }}
              >
                {runners.map(runner => {
                  return (
                    <Select.Option key={runner} value={runner}>
                      {runner}
                    </Select.Option>
                  )
                })}
              </Select>
            </FormControl>
          </>
        ) : (
          <p>No trial results were recorded.</p>
        )}
        <FormControl>
          <FormControl.Label>Metric</FormControl.Label>
          <Select
            value={metricId}
            onChange={event => {
              setMetricId(event.currentTarget.value)
            }}
          >
            {results.metrics.map(metric => {
              return (
                <Select.Option key={metric.id} value={metric.id}>
                  {metric.label}
                </Select.Option>
              )
            })}
          </Select>
        </FormControl>
        <FormControl>
          <FormControl.Label>Compare against</FormControl.Label>
          <Select
            value={referenceId}
            onChange={event => {
              setReferenceId(event.currentTarget.value)
            }}
          >
            {references.length === 0 ? <Select.Option value="">No reference recorded</Select.Option> : null}
            {references.map(reference => {
              return (
                <Select.Option key={reference.id} value={reference.id}>
                  {reference.name}
                </Select.Option>
              )
            })}
          </Select>
        </FormControl>
      </div>
      <p className="text-muted">
        Checks average per-check, per-trial pass percentages or measurement means within each capability. Units and
        directions stay separate. Skips, errors, and missing values are reported separately. Resource usage is the
        average per trial. Parentheses show percent change from the selected reference; N/A means the comparison is
        unavailable. Compare coverage before comparing performance.
      </p>
      <Table.Container>
        <span className="sr-only" id={`${headingId}-capabilities`}>
          Capability treatment comparisons
        </span>
        <DataTable
          aria-labelledby={`${headingId}-capabilities`}
          columns={[
            {
              id: 'capability',
              header: 'Capability',
              field: 'name',
              rowHeader: true,
              renderCell: (row: MatrixRow) => {
                return (
                  <Button
                    variant="invisible"
                    aria-pressed={capabilityId === row.id}
                    onClick={() => {
                      setCapabilityId(row.id)
                    }}
                  >
                    {row.name}
                  </Button>
                )
              },
            },
            {id: 'scenarios', header: 'Scenarios', field: 'scenarioCount', align: 'end'},
            ...treatmentColumns,
          ]}
          data={results.capabilities.map(capability => {
            return {
              id: capability.id,
              name: capability.name,
              scenarioCount: capability.scenarios.length,
              treatments: capability.treatments,
            }
          })}
        />
      </Table.Container>
      {capability ? (
        <section className="flex flex-col gap-3" aria-label={`Scenario comparisons for ${capability.name}`}>
          <h3 className="text-title-small">{capability.name}: scenario results</h3>
          <Table.Container>
            <span className="sr-only" id={`${headingId}-scenarios`}>
              Scenario treatment comparisons for {capability.name}
            </span>
            <DataTable
              aria-labelledby={`${headingId}-scenarios`}
              columns={[
                {
                  id: 'scenario',
                  header: 'Scenario',
                  field: 'name',
                  rowHeader: true,
                  renderCell: (row: MatrixRow) => {
                    return (
                      <Link
                        href={
                          `/experiments/${experimentId}/runs/${date}${getCapabilityScenarioAnchor(capability.id, row.id).fragment}` as Route
                        }
                      >
                        {row.name}
                      </Link>
                    )
                  },
                },
                ...treatmentColumns,
              ]}
              data={capability.scenarios.map(scenario => {
                return {id: scenario.id, name: scenario.id, scenarioCount: 1, treatments: scenario.treatments}
              })}
            />
          </Table.Container>
        </section>
      ) : (
        <p>Select a capability to compare its scenarios.</p>
      )}
    </section>
  )
}
