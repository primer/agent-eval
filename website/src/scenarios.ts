import fs from 'node:fs/promises'
import path from 'node:path'
import type {Scenario as AgentEvalScenario} from '@primer/agent-eval'

const {listScenarios, getScenario} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval'
)

const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')

export type ScenarioSummary = Pick<AgentEvalScenario, 'id' | 'prompt'>

export type Scenario = ScenarioSummary & {
  description?: string
  tags: Array<string>
  config: string
  checks: Array<{
    name: string
    description?: string
    files: Array<{path: string; contents: string | null}>
  }>
}

export async function list(): Promise<Array<ScenarioSummary>> {
  const scenarios = await listScenarios({
    directory: SCENARIOS_DIR,
  })

  return scenarios.map(scenario => {
    return {
      id: scenario.id,
      prompt: scenario.prompt,
    }
  })
}

export async function get(id: string): Promise<Scenario> {
  const scenario = await getScenario({
    directory: SCENARIOS_DIR,
    name: id,
  })

  return {
    id: scenario.id,
    prompt: scenario.prompt,
    description: scenario.description,
    tags: scenario.tags,
    config: await fs.readFile(path.join(scenario.directory, 'scenario.config.ts'), 'utf8'),
    checks: await Promise.all(
      scenario.checks.map(async check => {
        return {
          name: check.name,
          description: check.description,
          files: await Promise.all(
            check.files.map(async file => {
              const textFile = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|css|html|txt)$/.test(file.relativePath)
              return {
                path: file.relativePath,
                contents: textFile ? await fs.readFile(file.filepath, 'utf8') : null,
              }
            }),
          ),
        }
      }),
    ),
  }
}
