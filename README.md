# agent-eval

> Tools for evaluating the performance of agents on Primer-related tasks.

## What this project does

This project provides a framework for using agent-eval to evaluate scenarios.
Experiments compare treatments across selected scenarios, while benchmarks
group scenarios into capabilities to measure broader agent performance.

Scenarios represent tasks where, given a prompt, we measure how the agent
behaves. This framework helps compare the effectiveness of different treatments
against the scenarios we care about.

Results are scored by:

- Correctness: how many tests the agent's output passes
- Qualitative criteria: weighted rubric scores from a read-only judge, when configured
- Cost: how much the agent spends in API calls
- Latency: how long the agent takes to complete the scenarios

## Core concepts

- **Scenarios** describe the task and tests used to grade the agent's output.
- **Experiments** select the models, scenarios, and treatments to run together.
- **Benchmarks** group scenarios by capability and compare them against the
  control treatment.
- **Treatments** define the conditions for a run, such as adding an MCP server,
  custom sub-agent, or skill before the scenario starts.

## Running evaluations

Run a local experiment with the `agent-eval` CLI:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval \
  --experiments ./experiments \
  --scenarios ./scenarios \
  --experiment mcp
```

Run a benchmark by selecting a file from the benchmarks directory:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval \
  --benchmarks ./benchmarks \
  --benchmark design-system \
  --scenarios ./scenarios
```

The benchmark, experiment, and scenario directories default to `./benchmarks`,
`./experiments`, and `./scenarios`. Results are written to `./output.json` by
default, with trial artifacts stored in `./artifacts`.

Use `--output-dir <directory>` to keep `output.json` and its artifacts together
with portable relative paths. It cannot be combined with `--output` or
`--artifacts`.

## Authoring scenarios

Scenarios live in [`./scenarios`](./scenarios/). Each scenario has a
`scenario.config.ts` file that defines the agent prompt and a `scenario.test.ts`
file that grades the agent's output. Scenarios can also include an optional
`browser.test.ts` file for checks that need a browser. The legacy
`scenario.browser.test.ts` filename remains supported:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent uses a Primer button correctly',
  prompt: 'Update the index page to use a primary button',
  tags: ['baseline', 'button', 'primer'],
})
```

## Authoring experiments

Experiments live in [`./experiments`](./experiments/). Each experiment is a
TypeScript file that exports an experiment config:

```ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Example experiment',
  description: 'Experiment config demonstrating different options',
  models: [
    {name: 'gpt-5.5', reasoningEfforts: ['low', 'medium', 'high']},
    {name: 'claude-opus-4.7', reasoningEfforts: ['medium']},
    {name: 'claude-sonnet-4.6', reasoningEfforts: ['high']},
  ],
  scenarios: ['001-agent-uses-button-from-primer', '002-agent-uses-octicon-from-primer'],
  treatments: [
    {
      name: 'Treatment one',
      async setup({sandbox}) {
        // ...
      },
    },
    {
      name: 'Treatment two',
      async setup({sandbox}) {
        // ...
      },
    },
  ],
})
```

Models can be specified by name to use the default `medium` reasoning effort or
with a `name` and `reasoningEfforts` array to run multiple variants.

The experiment config specifies:

- A name for the experiment
- A description explaining what the experiment is for
- Models against which to run the experiment
- Scenarios used to grade the model output
- Treatments that specify the different conditions to test

## Experiment options

Start with the basic experiment shape above, then add options as needed.

### Use the typed config helper

When authoring experiments outside of this repository, import the helper from
`@primer/agent-eval/experiment` to keep the experiment config typed:

```ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Example experiment',
  description: 'Experiment config demonstrating different options',
  models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [],
})
```

### Define inline scenarios

Scenarios can also be defined inline in an experiment. Inline scenario paths
resolve from the directory where the CLI is run, and use the same
`scenario.config.ts`, `scenario.test.ts`, and optional browser test files as
repository scenarios. Use `name` to override the scenario ID derived from the
directory name:

```ts
export const experiment = defineConfig({
  name: 'Local project experiment',
  description: 'Run a scenario from the current project',
  models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
  scenarios: [
    {
      name: 'local-button',
      path: './scenarios/local-button-scenario',
    },
  ],
  treatments: [],
})
```

## Authoring benchmarks

Benchmarks live in [`./benchmarks`](./benchmarks/) and group scenarios into
capabilities:

```ts
import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Design system',
  description: 'Measure agent performance across design system tasks',
  models: ['gpt-5.6-sol'],
  capabilities: [
    {
      name: 'Uses components',
      scenarios: ['001-agent-uses-button-from-primer'],
    },
  ],
})
```

Each benchmark runs the control treatment for every configured model variant
and scenario.

## Describing eval tests

Individual test titles and statuses are included in each run's `testResults`.
Add a JSDoc, block, or consecutive line comment immediately before a test to
include a description with that test's metadata:

```ts
/** Verifies that the agent used the required component. */
test('uses the required component', () => {
  // ...
})
```

## Treatment options

Treatments can progressively add setup behavior for the agent environment.

### Configure MCP servers

Treatments can configure MCP servers for the agent to use during a scenario. For
example, install a server in the sandbox, add instructions for when to use it,
and register it with `addMcpServer`:

```ts
export const experiment = defineConfig({
  name: 'MCP experiment',
  description: 'Compare behavior with a Primer MCP server',
  models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With Primer MCP',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction('For UI-related changes, use the Primer MCP server before editing.')
        await sandbox.runCommand('npm', ['install', '-g', '@primer/mcp@latest'])
        await sandbox.addMcpServer('primer', {
          type: 'local',
          command: 'npx',
          args: ['--no-install', '@primer/mcp'],
          tools: ['*'],
        })
      },
    },
  ],
})
```

### Configure custom Copilot sub-agents

Treatments can configure custom Copilot sub-agents under `~/.copilot/agents`.
Use `files` when the sub-agent should reference additional local files, folders,
or inline content:

```ts
export const experiment = defineConfig({
  name: 'Custom agent experiment',
  description: 'Compare behavior with a custom implementation planner',
  models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With custom sub-agent',
      async setup({sandbox}) {
        await sandbox.addCustomAgent('implementation-planner', 'Plans implementation work', 'Create concise plans.', {
          tools: ['read', 'search'],
          files: [
            {
              sourcePath: './docs/planning-guidelines.md',
              destinationPath: 'implementation-planner/guidelines.md',
            },
            {
              path: 'implementation-planner/context.md',
              content: 'Prefer short, actionable implementation plans.',
            },
          ],
        })
      },
    },
  ],
})
```

### Configure Copilot skills

Treatments can also configure Copilot skills under `~/.agents/skills`. Use
`files` when the skill should include additional local files, folders, or inline
content next to `SKILL.md`:

```ts
export const experiment = defineConfig({
  name: 'Skill experiment',
  description: 'Compare behavior with a planning skill',
  models: [{name: 'gpt-5.5', reasoningEfforts: ['high']}],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With planning skill',
      async setup({sandbox}) {
        await sandbox.addAgentSkill('planning', 'Plans implementation work', 'Create concise plans.', {
          files: [
            {
              sourcePath: './docs/planning-guidelines.md',
              destinationPath: 'guidelines.md',
            },
            {
              path: 'context.md',
              content: 'Prefer short, actionable implementation plans.',
            },
          ],
        })
      },
    },
  ],
})
```

### Configure Copilot plugins

Treatments can install Copilot plugins from remote Git repositories, local
directories, or plugin marketplaces. Set `version` to install a specific remote
branch or tag:

```ts
await sandbox.addCopilotPlugin({
  type: 'remote',
  url: 'https://github.com/example/copilot-plugin.git',
})

await sandbox.addCopilotPlugin({
  type: 'remote',
  url: 'https://github.com/example/copilot-plugin.git',
  version: 'v1.2.3',
})

await sandbox.addCopilotPlugin({
  type: 'local',
  sourcePath: './plugins/copilot-plugin',
})
```

For a marketplace plugin, provide the marketplace name from its
`marketplace.json` and configure either a remote or local marketplace source:

```ts
await sandbox.addCopilotPlugin({
  type: 'marketplace',
  name: 'example-plugin',
  marketplace: {
    name: 'example-marketplace',
    source: {
      type: 'remote',
      url: 'https://github.com/example/copilot-marketplace.git',
    },
  },
})

await sandbox.addCopilotPlugin({
  type: 'marketplace',
  name: 'local-plugin',
  marketplace: {
    name: 'local-marketplace',
    source: {
      type: 'local',
      sourcePath: './plugins/local-marketplace',
    },
  },
})
```
