import Link from 'next/link'
import {notFound} from 'next/navigation'
import {queueExperimentRunAction, updateExperimentAction} from '../../actions'
import {
  Badge,
  Card,
  Field,
  formatDate,
  inputClassName,
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-3">
          {runs.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-600">No runs have been queued yet.</p>
            </Card>
          ) : (
            runs.map(run => (
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" key={run.id}>
                <div>
                  <p className="font-mono text-sm text-slate-800">{run.id}</p>
                  <p className="mt-1 text-xs text-slate-500">
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
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="font-semibold text-slate-900">Scenarios</h3>
            <ul className="mt-3 space-y-3">
              {experiment.scenarioIds.map(scenarioId => {
                const scenario = getScenario(scenarioId)
                return (
                  <li key={scenarioId}>
                    <Link
                      className="text-sm font-medium text-blue-700 hover:underline"
                      href={`/scenarios/${scenarioId}`}
                    >
                      {scenario?.name ?? scenarioId}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
          <Card>
            <h3 className="font-semibold text-slate-900">Treatments</h3>
            <ul className="mt-3 space-y-3">
              {experiment.treatments.map(treatment => (
                <li className="text-sm" key={treatment.id}>
                  <p className="font-medium text-slate-800">{treatment.name}</p>
                  {treatment.description ? <p className="mt-1 text-slate-500">{treatment.description}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section title="Edit experiment" description="Changes update the in-memory scaffold repository.">
        <Card>
          <form action={updateAction} className="grid gap-6">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Name" name="name">
                <input className={inputClassName} defaultValue={experiment.name} id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input
                  className={inputClassName}
                  defaultValue={experiment.description}
                  id="description"
                  name="description"
                  required
                />
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">Models</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {modelIds.map(model => (
                  <label
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    key={model}
                  >
                    <input
                      className="size-4 accent-blue-700"
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
              <legend className="text-sm font-semibold text-slate-800">Scenarios</legend>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {scenarios.map(scenario => (
                  <label
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    key={scenario.id}
                  >
                    <input
                      className="size-4 accent-blue-700"
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
                className={inputClassName}
                defaultValue={experiment.treatments.map(treatment => treatment.name).join('\n')}
                id="treatments"
                name="treatments"
                required
                rows={4}
              />
            </Field>
            <div className="flex items-center gap-3">
              <SubmitButton>Save changes</SubmitButton>
              <Badge>Updated {formatDate(experiment.updatedAt)}</Badge>
            </div>
          </form>
        </Card>
      </Section>
    </>
  )
}
