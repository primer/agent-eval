import Link from 'next/link'
import {createExperimentAction} from '../actions'
import {Badge, Card, Field, formatDate, PageHeader, Section, SubmitButton} from '../../components/ui'
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
        <div>
          {experiments.map(experiment => (
            <Card key={experiment.id}>
              <div>
                <div>
                  <Link href={`/experiments/${experiment.id}`}>{experiment.name}</Link>
                  <p>{experiment.description}</p>
                </div>
                <Badge tone="info">{experiment.treatments.length} treatments</Badge>
              </div>
              <div>
                {experiment.models.map(model => (
                  <Badge key={model}>{model}</Badge>
                ))}
              </div>
              <p>Updated {formatDate(experiment.updatedAt)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Create experiment" description="Create an in-memory draft from the current scenario catalog.">
        <Card>
          <form action={createExperimentAction}>
            <div>
              <Field label="Name" name="name">
                <input id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input id="description" name="description" required />
              </Field>
            </div>

            <fieldset>
              <legend>Models</legend>
              <p>Select every model included in the run matrix.</p>
              <div>
                {modelIds.map(model => (
                  <label key={model}>
                    <input name="models" type="checkbox" value={model} />
                    {model}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Scenarios</legend>
              <p>Choose the reusable tasks this experiment should run.</p>
              <div>
                {scenarios.map(scenario => (
                  <label key={scenario.id}>
                    <input name="scenarioIds" type="checkbox" value={scenario.id} />
                    <span>
                      <span>{scenario.name}</span>
                      <span>{scenario.id}</span>
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
              <textarea aria-describedby="treatments-description" id="treatments" name="treatments" required rows={4} />
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
