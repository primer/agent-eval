import fs from 'node:fs/promises'
import path from 'node:path'
import type {ResolvedScenario} from '@primer/agent-eval/scenarios'

const {listScenarios, findScenario} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval/scenarios'
)

const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')

export type ScenarioSummary = Pick<ResolvedScenario['config'], 'prompt'> & {
  id: string
}

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
      prompt: scenario.config.prompt,
    }
  })
}

export async function get(id: string): Promise<Scenario> {
  const scenario = await findScenario(id, {
    directory: SCENARIOS_DIR,
  })

  if (!scenario) {
    throw new Error(`Scenario "${id}" was not found in: ${SCENARIOS_DIR}`)
  }

  return {
    id: scenario.id,
    prompt: scenario.config.prompt,
    test: await fs.readFile(scenario.testPath, 'utf8'),
  }
}
