import Link from 'next/link'
import {createScenarioAction} from '../actions'
import {Badge, Card, Field, formatDate, PageHeader, Section, SubmitButton} from '../../components/ui'
import {listScenarios} from '../../lib/repository'

export const metadata = {title: 'Scenarios'}

export default function ScenariosPage() {
  const scenarios = listScenarios()

  return (
    <>
      <PageHeader
        eyebrow="Scenarios"
        title="Define reusable evaluation tasks"
        description="A scenario combines a workspace fixture, a natural-language prompt, assertions, and an optional baseline."
      />

      <Section title="All scenarios" description={`${scenarios.length} scenarios in this workspace.`}>
        <div>
          <table>
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Tags</th>
                <th scope="col">Baseline</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map(scenario => (
                <tr key={scenario.id}>
                  <td>
                    <Link href={`/scenarios/${scenario.id}`}>{scenario.name}</Link>
                    <p>
                      {scenario.id} · updated {formatDate(scenario.updatedAt)}
                    </p>
                  </td>
                  <td>
                    <div>
                      {scenario.tags.map(tag => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  </td>
                  <td>
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

      <Section
        title="Create scenario"
        description="Create a draft scenario record before wiring its fixture and test file."
      >
        <Card>
          <form action={createScenarioAction}>
            <div>
              <Field label="Name" name="name">
                <input id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input id="description" name="description" required />
              </Field>
            </div>
            <Field
              label="Prompt"
              name="prompt"
              description="Use general language that describes the user task being evaluated."
            >
              <textarea aria-describedby="prompt-description" id="prompt" name="prompt" required rows={5} />
            </Field>
            <Field label="Tags" name="tags" description="Enter one tag per line.">
              <textarea aria-describedby="tags-description" id="tags" name="tags" rows={3} />
            </Field>
            <div>
              <SubmitButton>Create scenario</SubmitButton>
            </div>
          </form>
        </Card>
      </Section>
    </>
  )
}
