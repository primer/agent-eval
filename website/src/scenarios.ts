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
  tests: string[]
}

function extractTestNames(content: string): string[] {
  const names: string[] = []

  // Regular tests: test('name', ...)
  const regularRegex = /\btest\b(?!\.each)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\1/g
  let match: RegExpExecArray | null
  while ((match = regularRegex.exec(content)) !== null) {
    names.push(match[2])
  }

  // Parameterized tests: test.each([...])('name', ...)
  // The closing `])` ends the array and `('name', ...)` follows
  const eachNameRegex = /\]\)\s*\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\1/g
  while ((match = eachNameRegex.exec(content)) !== null) {
    names.push(match[2])
  }

  return names
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

  const test = await fs.readFile(scenario.testPath, 'utf8')

  return {
    id: scenario.id,
    prompt: scenario.config.prompt,
    test,
    tests: extractTestNames(test),
  }
}
