import Link from 'next/link'
import {createScenarioAction} from '../actions'
import {Badge, Card, Field, formatDate, inputClassName, PageHeader, Section, SubmitButton} from '../../components/ui'
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
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Scenario
                </th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell" scope="col">
                  Tags
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Baseline
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scenarios.map(scenario => (
                <tr key={scenario.id}>
                  <td className="px-4 py-4">
                    <Link className="font-semibold text-blue-700 hover:underline" href={`/scenarios/${scenario.id}`}>
                      {scenario.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {scenario.id} · updated {formatDate(scenario.updatedAt)}
                    </p>
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {scenario.tags.map(tag => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
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

      <Section
        title="Create scenario"
        description="Create a draft scenario record before wiring its fixture and test file."
      >
        <Card>
          <form action={createScenarioAction} className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Name" name="name">
                <input className={inputClassName} id="name" name="name" required />
              </Field>
              <Field label="Description" name="description">
                <input className={inputClassName} id="description" name="description" required />
              </Field>
            </div>
            <Field
              label="Prompt"
              name="prompt"
              description="Use general language that describes the user task being evaluated."
            >
              <textarea
                aria-describedby="prompt-description"
                className={inputClassName}
                id="prompt"
                name="prompt"
                required
                rows={5}
              />
            </Field>
            <Field label="Tags" name="tags" description="Enter one tag per line.">
              <textarea aria-describedby="tags-description" className={inputClassName} id="tags" name="tags" rows={3} />
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
