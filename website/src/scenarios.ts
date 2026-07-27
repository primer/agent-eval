import path from 'node:path'
import type {ResolvedScenario} from '@primer/agent-eval'

const {listScenarios, findScenario} = await import(
  /* turbopackIgnore: true */
  '@primer/agent-eval'
)

const SCENARIOS_DIR = path.resolve(process.cwd(), '..', 'scenarios')

export type Scenario = Pick<ResolvedScenario['config'], 'prompt'> & {
  id: string
}

export async function list(): Promise<Array<Scenario>> {
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
  }
}
