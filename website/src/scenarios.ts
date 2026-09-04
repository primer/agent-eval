import fs from 'node:fs/promises'
import path from 'node:path'
import type {Scenario as AgentEvalScenario} from '@primer/agent-eval/scenario'

const {listScenarios, getScenario} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval/scenario'
)

const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')

export type ScenarioSummary = Pick<AgentEvalScenario, 'id' | 'prompt'>

export type Scenario = ScenarioSummary & {
  test: string
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
    id,
  })

  return {
    id: scenario.id,
    prompt: scenario.prompt,
    test: await fs.readFile(scenario.testPath, 'utf8'),
  }
}
