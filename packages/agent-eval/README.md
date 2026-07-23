# @primer/agent-eval

Run Primer agent evaluation experiments from the command line or from Node.js.

## CLI

Install the package and run the `agent-eval` binary with a GitHub token:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval \
  --experiments ./experiments \
  --scenarios ./scenarios \
  --experiment example
```

Use `--experiments` to load experiment files from a local directory. Experiment
files may export an `experiment` named export or a default export. `--experiment`
may also be a path to a local experiment file when you only want to run one
experiment. Use `--scenarios` to set the directory containing scenario
directories; it defaults to `./scenarios`.

## Scenario config authoring

Use `defineScenario` from `@primer/agent-eval/scenario` in each
`scenario.config.ts` file:

```ts
import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  prompt: 'Update the index page to use a primary button',
})
```

## Experiment config authoring

Use `defineConfig` from `@primer/agent-eval/experiment` to keep local experiment
files typed:

```ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Example experiment',
  description: 'Compare treatment behavior',
  models: ['gpt-5.5'],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [],
})
```

Treatment setup can add custom Copilot sub-agents to `~/.copilot/agents`:

```ts
await sandbox.addCustomAgent('test-specialist', 'Focuses on test coverage', 'Write focused tests.', {
  tools: ['read', 'search', 'edit'],
  files: [
    {sourcePath: './docs/testing.md', destinationPath: 'test-specialist/testing.md'},
    {path: 'test-specialist/context.md', content: 'Prioritize deterministic tests.'},
  ],
})
```

Treatment setup can also add Copilot skills to `~/.agents/skills` with
additional files next to `SKILL.md`:

```ts
await sandbox.addAgentSkill('test-planning', 'Plans test coverage', 'Create focused test plans.', {
  files: [
    {sourcePath: './docs/testing.md', destinationPath: 'testing.md'},
    {path: 'context.md', content: 'Prioritize deterministic tests.'},
  ],
})
```

## Programmatic usage

The package index exports the experiment loading, scenario discovery, and runner
APIs:

```ts
import {findScenario, listScenarios, loadExperimentConfigs, run, type Model} from '@primer/agent-eval'

const experiments = await loadExperimentConfigs({directory: './experiments'})
const scenarios = await listScenarios({directory: './scenarios'})
const scenario = await findScenario('001-agent-uses-button-from-primer', {
  directory: './scenarios',
})
```
