import Link from 'next/link'
import {notFound} from 'next/navigation'
import {queueExperimentRunAction, updateExperimentAction} from '../../actions'
import {
  Badge,
  Card,
  Field,
  formatDate,
  Notice,
  PageHeader,
  passRate,
  Section,
  Stat,
  StatusBadge,
  SubmitButton,
} from '../../../components/ui'
import {modelIds} from '../../../lib/domain'
import {getExperiment, getScenario, listRuns, listScenarios} from '../../../lib/repository'

export async function generateMetadata({params}: {params: Promise<{id: string}>}) {
  const {id} = await params
  const experiment = getExperiment(id)
  return {title: experiment?.name ?? 'Experiment'}
}

export default async function ExperimentPage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>
  searchParams: Promise<{saved?: string; run?: string}>
}) {
  const {id} = await params
  const query = await searchParams
  const experiment = getExperiment(id)
  if (!experiment) notFound()

  const scenarios = listScenarios()
  const runs = listRuns(experiment.id)
  const latestRun = runs[0]
  const latestTests = latestRun?.results.reduce(
    (total, result) => ({
      passed: total.passed + result.tests.passed,
      failed: total.failed + result.tests.failed,
    }),
    {passed: 0, failed: 0},
  )
  const updateAction = updateExperimentAction.bind(null, experiment.id)
  const runAction = queueExperimentRunAction.bind(null, experiment.id)

  return (
    <>
      <PageHeader
        eyebrow={experiment.id}
        title={experiment.name}
        description={experiment.description}
        actions={
          <form action={runAction}>
            <SubmitButton>Run experiment</SubmitButton>
          </form>
        }
      />

      {query.saved ? <Notice>Experiment changes saved.</Notice> : null}
      {query.run ? <Notice>Run {query.run} was added to the queue.</Notice> : null}

      <div>
        <Stat label="Models" value={String(experiment.models.length)} />
        <Stat label="Scenarios" value={String(experiment.scenarioIds.length)} />
        <Stat label="Treatments" value={String(experiment.treatments.length)} />
        <Stat
          label="Latest pass rate"
          value={latestTests ? passRate(latestTests.passed, latestTests.failed) : '—'}
          detail={latestRun ? latestRun.status : 'No runs'}
        />
      </div>

      <Section title="Run history" description="Queued and completed executions for this experiment.">
        <div>
          {runs.length === 0 ? (
            <Card>
              <p>No runs have been queued yet.</p>
            </Card>
          ) : (
            runs.map(run => (
              <Card key={run.id}>
                <div>
                  <p>{run.id}</p>
                  <p>
                    Queued {formatDate(run.queuedAt)} · {run.results.length} results
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </Card>
            ))
          )}
        </div>
      </Section>

      <Section title="Run matrix" description="Every selected model runs each scenario under every treatment.">
        <div>
          <Card>
            <h3>Scenarios</h3>
            <ul>
              {experiment.scenarioIds.map(scenarioId => {
                const scenario = getScenario(scenarioId)
                return (
                  <li key={scenarioId}>
                    <Link href={`/scenarios/${scenarioId}`}>{scenario?.name ?? scenarioId}</Link>
                  </li>
                )
              })}
            </ul>
          </Card>
          <Card>
            <h3>Treatments</h3>
            <ul>
              {experiment.treatments.map(treatment => (
                <li key={treatment.id}>
                  <p>{treatment.name}</p>
                  {treatment.description ? <p>{treatment.description}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section title="Edit experiment" description="Changes update the in-memory scaffold repository.">
        <Card>
          <form action={updateAction}>
            <div>
              <Field label="Name" name="name">
                <input defaultValue={experiment.name} id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input defaultValue={experiment.description} id="description" name="description" required />
              </Field>
            </div>
            <fieldset>
              <legend>Models</legend>
              <div>
                {modelIds.map(model => (
                  <label key={model}>
                    <input
                      defaultChecked={experiment.models.includes(model)}
                      name="models"
                      type="checkbox"
                      value={model}
                    />
                    {model}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Scenarios</legend>
              <div>
                {scenarios.map(scenario => (
                  <label key={scenario.id}>
                    <input
                      defaultChecked={experiment.scenarioIds.includes(scenario.id)}
                      name="scenarioIds"
                      type="checkbox"
                      value={scenario.id}
                    />
                    {scenario.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Treatments" name="treatments" description="Enter one treatment name per line.">
              <textarea
                aria-describedby="treatments-description"
                defaultValue={experiment.treatments.map(treatment => treatment.name).join('\n')}
                id="treatments"
                name="treatments"
                required
                rows={4}
              />
            </Field>
            <div>
              <SubmitButton>Save changes</SubmitButton>
              <Badge>Updated {formatDate(experiment.updatedAt)}</Badge>
            </div>
          </form>
        </Card>
      </Section>
    </>
  )
}
