import {notFound} from 'next/navigation'
import {updateScenarioAction} from '../../actions'
import {
  Badge,
  Card,
  Field,
  formatDate,
  formatDuration,
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
            <div>
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
              <dl>
                <div>
                  <dt>Baseline ID</dt>
                  <dd>{baseline.id}</dd>
                </div>
                <div>
                  <dt>Passed</dt>
                  <dd>{baseline.tests.passed}</dd>
                </div>
                <div>
                  <dt>Failed</dt>
                  <dd>{baseline.tests.failed}</dd>
                </div>
                <div>
                  <dt>Premium requests</dt>
                  <dd>{baseline.metrics.premiumRequests}</dd>
                </div>
              </dl>
            </Card>
          </>
        ) : (
          <Card>
            <p>No baseline has been recorded for this scenario.</p>
          </Card>
        )}
      </Section>

      <Section title="Scenario definition">
        <div>
          <Card>
            <h3>Prompt</h3>
            <p>{scenario.prompt}</p>
          </Card>
          <Card>
            <h3>Test and metadata</h3>
            <dl>
              <div>
                <dt>Test path</dt>
                <dd>{scenario.testPath}</dd>
              </div>
              <div>
                <dt>Tags</dt>
                <dd>
                  {scenario.tags.map(tag => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(scenario.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </Section>

      <Section title="Edit scenario" description="Update the scenario metadata and prompt used by the route scaffold.">
        <Card>
          <form action={updateAction}>
            <div>
              <Field label="Name" name="name">
                <input defaultValue={scenario.name} id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input defaultValue={scenario.description} id="description" name="description" required />
              </Field>
            </div>
            <Field label="Prompt" name="prompt" description="The task sent to the agent.">
              <textarea
                aria-describedby="prompt-description"
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
