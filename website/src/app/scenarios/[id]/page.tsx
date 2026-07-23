import {notFound} from 'next/navigation'
import {updateScenarioAction} from '../../actions'
import {
  Badge,
  Card,
  Field,
  formatDate,
  formatDuration,
  inputClassName,
  Notice,
  PageHeader,
  passRate,
  Section,
  Stat,
  SubmitButton,
} from '../../../components/ui'
import {getScenario} from '../../../lib/repository'

export async function generateMetadata({params}: {params: Promise<{id: string}>}) {
  const {id} = await params
  const scenario = getScenario(id)
  return {title: scenario?.name ?? 'Scenario'}
}

export default async function ScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{id: string}>
  searchParams: Promise<{saved?: string}>
}) {
  const {id} = await params
  const query = await searchParams
  const scenario = getScenario(id)
  if (!scenario) notFound()

  const baseline = scenario.baseline
  const updateAction = updateScenarioAction.bind(null, scenario.id)

  return (
    <>
      <PageHeader eyebrow={scenario.id} title={scenario.name} description={scenario.description} />
      {query.saved ? <Notice>Scenario changes saved.</Notice> : null}

      <Section title="Baseline results" description="The most recent control run recorded for this scenario.">
        {baseline ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Status" value={baseline.status} detail={`Recorded ${formatDate(baseline.recordedAt)}`} />
              <Stat
                label="Test pass rate"
                value={passRate(baseline.tests.passed, baseline.tests.failed)}
                detail={`${baseline.tests.passed} passed · ${baseline.tests.failed} failed`}
              />
              <Stat
                label="Duration"
                value={formatDuration(baseline.metrics.durationMs)}
                detail={`${baseline.metrics.turns} turns`}
              />
              <Stat
                label="Output tokens"
                value={baseline.metrics.outputTokens.toLocaleString()}
                detail={baseline.model}
              />
            </div>
            <Card>
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Baseline ID</dt>
                  <dd className="mt-1 font-mono text-xs">{baseline.id}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Passed</dt>
                  <dd className="mt-1 font-semibold">{baseline.tests.passed}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Failed</dt>
                  <dd className="mt-1 font-semibold">{baseline.tests.failed}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Premium requests</dt>
                  <dd className="mt-1 font-semibold">{baseline.metrics.premiumRequests}</dd>
                </div>
              </dl>
            </Card>
          </>
        ) : (
          <Card>
            <p className="text-sm text-slate-600">No baseline has been recorded for this scenario.</p>
          </Card>
        )}
      </Section>

      <Section title="Scenario definition">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-slate-800">Prompt</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{scenario.prompt}</p>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-slate-800">Test and metadata</h3>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Test path</dt>
                <dd className="mt-1 font-mono text-xs">{scenario.testPath}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Tags</dt>
                <dd className="mt-2 flex flex-wrap gap-1">
                  {scenario.tags.map(tag => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Updated</dt>
                <dd className="mt-1">{formatDate(scenario.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </Section>

      <Section title="Edit scenario" description="Update the scenario metadata and prompt used by the route scaffold.">
        <Card>
          <form action={updateAction} className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Name" name="name">
                <input className={inputClassName} defaultValue={scenario.name} id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input
                  className={inputClassName}
                  defaultValue={scenario.description}
                  id="description"
                  name="description"
                  required
                />
              </Field>
            </div>
            <Field label="Prompt" name="prompt" description="The task sent to the agent.">
              <textarea
                aria-describedby="prompt-description"
                className={inputClassName}
                defaultValue={scenario.prompt}
                id="prompt"
                name="prompt"
                required
                rows={6}
              />
            </Field>
            <Field label="Tags" name="tags" description="Enter one tag per line.">
              <textarea
                aria-describedby="tags-description"
                className={inputClassName}
                defaultValue={scenario.tags.join('\n')}
                id="tags"
                name="tags"
                rows={3}
              />
            </Field>
            <div>
              <SubmitButton>Save changes</SubmitButton>
            </div>
          </form>
        </Card>
      </Section>
    </>
  )
}
