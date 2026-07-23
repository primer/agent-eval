# @primer/agent-eval

Run Primer agent evaluation experiments from the command line or from Node.js.

## CLI

Install the package and run the `agent-eval` binary with a GitHub token:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval --experiments ./experiments --experiment example
```

Use `--experiments` to load experiment files from a local directory. Experiment
files may export an `experiment` named export or a default export. `--experiment`
may also be a path to a local experiment file when you only want to run one
experiment.

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

Use `createExperiment` from `@primer/agent-eval/config` to keep local experiment
files typed:

```ts
import {createExperiment} from '@primer/agent-eval/config'

export const experiment = createExperiment({
  name: 'Example experiment',
  description: 'Compare treatment behavior',
  models: ['gpt-5.5'],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [],
})
```

Treatment setup can add custom Copilot sub-agents to `~/.copilot/agents`:
Use `directories` to copy all contents of a local directory without its root
directory. The destination defaults to the source directory's name.

```ts
await sandbox.addCustomAgent('test-specialist', 'Focuses on test coverage', 'Write focused tests.', {
  tools: ['read', 'search', 'edit'],
  files: [
    {sourcePath: './docs/testing.md', destinationPath: 'test-specialist/testing.md'},
    {path: 'test-specialist/context.md', content: 'Prioritize deterministic tests.'},
  ],
  directories: [{sourcePath: './docs/test-specialist'}],
})
```

Treatment setup can also add Copilot skills to `~/.agents/skills` with
additional files next to `SKILL.md`. Skill `directories` copy their contents
next to `SKILL.md` by default.

```ts
await sandbox.addAgentSkill('test-planning', 'Plans test coverage', 'Create focused test plans.', {
  files: [
    {sourcePath: './docs/testing.md', destinationPath: 'testing.md'},
    {path: 'context.md', content: 'Prioritize deterministic tests.'},
  ],
  directories: [{sourcePath: './docs/test-planning'}],
})
```

## Programmatic usage

The package index exports the experiment loading and runner APIs:

```ts
import {loadExperimentConfigs, run} from '@primer/agent-eval'
```
