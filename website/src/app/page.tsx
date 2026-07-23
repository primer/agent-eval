import Link from 'next/link'
import {
  Badge,
  ButtonLink,
  Card,
  formatDate,
  formatDuration,
  PageHeader,
  passRate,
  Section,
  Stat,
  StatusBadge,
} from '../components/ui'
import {getDashboardSnapshot} from '../lib/repository'

export default function IndexPage() {
  const snapshot = getDashboardSnapshot()
  const {baseline} = snapshot

  return (
    <>
      <PageHeader
        eyebrow="Workspace overview"
        title="Agent evaluation dashboard"
        description="Track baseline health, define reusable scenarios, and compare agent treatments across models."
        actions={
          <ButtonLink href="/experiments" variant="primary">
            Create experiment
          </ButtonLink>
        }
      />

      <Section title="Baseline" description="Latest recorded result for each scenario.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Scenario coverage"
            value={`${baseline.passing}/${baseline.scenarios}`}
            detail="passing baselines"
          />
          <Stat
            label="Test pass rate"
            value={passRate(baseline.tests.passed, baseline.tests.failed)}
            detail={`${baseline.tests.passed} passed · ${baseline.tests.failed} failed`}
          />
          <Stat label="Average duration" value={formatDuration(baseline.averageDurationMs)} detail="per scenario" />
          <Stat
            label="Experiments"
            value={String(snapshot.experiments.length)}
            detail={`${snapshot.recentRuns.length} recent runs`}
          />
        </div>
      </Section>

      <Section
        title="Experiments"
        description="Configurations that combine models, scenarios, and treatments."
        action={<ButtonLink href="/experiments">View all</ButtonLink>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {snapshot.experiments.slice(0, 4).map(experiment => (
            <Card key={experiment.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link className="font-semibold text-blue-700 hover:underline" href={`/experiments/${experiment.id}`}>
                    {experiment.name}
                  </Link>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{experiment.description}</p>
                </div>
                <Badge>{experiment.models.length} models</Badge>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                <div>
                  <dt className="text-slate-500">Scenarios</dt>
                  <dd className="mt-1 font-semibold">{experiment.scenarioIds.length}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Treatments</dt>
                  <dd className="mt-1 font-semibold">{experiment.treatments.length}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        title="Scenarios"
        description="Reusable prompts and assertions with a tracked baseline."
        action={<ButtonLink href="/scenarios">View all</ButtonLink>}
      >
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Scenario
                </th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell" scope="col">
                  Model
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Baseline
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshot.scenarios.map(scenario => (
                <tr key={scenario.id}>
                  <td className="px-4 py-4">
                    <Link className="font-semibold text-blue-700 hover:underline" href={`/scenarios/${scenario.id}`}>
                      {scenario.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{scenario.id}</p>
                  </td>
                  <td className="hidden px-4 py-4 text-slate-600 sm:table-cell">
                    {scenario.baseline?.model ?? 'Not recorded'}
                  </td>
                  <td className="px-4 py-4">
                    <Badge
                      tone={scenario.baseline?.status === 'passing' ? 'good' : scenario.baseline ? 'bad' : 'neutral'}
                    >
                      {scenario.baseline?.status ?? 'missing'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Recent runs">
        <div className="grid gap-3">
          {snapshot.recentRuns.map(run => {
            const experiment = snapshot.experiments.find(item => item.id === run.experimentId)
            return (
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" key={run.id}>
                <div>
                  <Link
                    className="font-semibold text-blue-700 hover:underline"
                    href={`/experiments/${run.experimentId}`}
                  >
                    {experiment?.name ?? run.experimentId}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">Queued {formatDate(run.queuedAt)}</p>
                </div>
                <StatusBadge status={run.status} />
              </Card>
            )
          })}
        </div>
      </Section>
    </>
  )
}
