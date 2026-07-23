import Link from 'next/link'
import {createExperimentAction} from '../actions'
import {Badge, Card, Field, formatDate, inputClassName, PageHeader, Section, SubmitButton} from '../../components/ui'
import {modelIds} from '../../lib/domain'
import {listExperiments, listScenarios} from '../../lib/repository'

export const metadata = {title: 'Experiments'}

export default function ExperimentsPage() {
  const experiments = listExperiments()
  const scenarios = listScenarios()

  return (
    <>
      <PageHeader
        eyebrow="Experiments"
        title="Compare agent configurations"
        description="An experiment selects scenarios and models, then defines the treatments to compare."
      />

      <Section title="All experiments" description={`${experiments.length} experiments in this workspace.`}>
        <div className="grid gap-4 md:grid-cols-2">
          {experiments.map(experiment => (
            <Card key={experiment.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    className="text-lg font-semibold text-blue-700 hover:underline"
                    href={`/experiments/${experiment.id}`}
                  >
                    {experiment.name}
                  </Link>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{experiment.description}</p>
                </div>
                <Badge tone="info">{experiment.treatments.length} treatments</Badge>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {experiment.models.map(model => (
                  <Badge key={model}>{model}</Badge>
                ))}
              </div>
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                Updated {formatDate(experiment.updatedAt)}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Create experiment" description="Create an in-memory draft from the current scenario catalog.">
        <Card>
          <form action={createExperimentAction} className="grid gap-6">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Name" name="name">
                <input className={inputClassName} id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input className={inputClassName} id="description" name="description" required />
              </Field>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">Models</legend>
              <p className="mt-1 text-sm text-slate-500">Select every model included in the run matrix.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {modelIds.map(model => (
                  <label
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    key={model}
                  >
                    <input className="size-4 accent-blue-700" name="models" type="checkbox" value={model} />
                    {model}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">Scenarios</legend>
              <p className="mt-1 text-sm text-slate-500">Choose the reusable tasks this experiment should run.</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {scenarios.map(scenario => (
                  <label
                    className="flex items-start gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm"
                    key={scenario.id}
                  >
                    <input
                      className="mt-0.5 size-4 accent-blue-700"
                      name="scenarioIds"
                      type="checkbox"
                      value={scenario.id}
                    />
                    <span>
                      <span className="block font-medium text-slate-800">{scenario.name}</span>
                      <span className="mt-1 block text-xs text-slate-500">{scenario.id}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              label="Treatments"
              name="treatments"
              description="Enter one treatment name per line. Setup configuration can be added to the persistence layer later."
            >
              <textarea
                aria-describedby="treatments-description"
                className={inputClassName}
                id="treatments"
                name="treatments"
                required
                rows={4}
              />
            </Field>
            <div>
              <SubmitButton>Create experiment</SubmitButton>
            </div>
          </form>
        </Card>
      </Section>
    </>
  )
}
