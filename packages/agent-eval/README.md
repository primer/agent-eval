# @primer/agent-eval

A library and CLI tool for creating and running experiments and benchmarks that
evaluate agent behavior across different scenarios.

## Getting started

To install `@primer/agent-eval` in your project, you will need to run the following
command using [npm](https://www.npmjs.com/):

```bash
npm install -S @primer/agent-eval
```

This provides the `agent-eval` executable and the package's programmatic APIs.
Typically, you'll first create an experiment:

```tsx
// experiments/example.ts

import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Experiment name',
  description: 'A description for the experiment',

  // An array of models and their reasoning efforts that you would like to evaluate against
  models: [
    'gpt-5.5',
    {
      name: 'claude-opus-4.8',
      reasoningEfforts: ['medium', 'high'],
    },
  ],

  // An array of scenarios that setup tasks for your agent to perform and
  // for you to evaluate their performance
  scenarios: ['uses-button-from-primer'],

  // An array of treatments. Each treatment is tested and compared against
  // each other and to the control for the experiment. A treatment represents a
  // series of steps to setup the environment that an agent runs within. For
  // example, it may add agent instructions, MCP servers, skill, etc.
  //
  // Multiple treatments may be used if you want to compare two approaches
  // against each other, for example an MCP server vs a skill, for the scenarios
  // you are testing against
  treatments: [
    {
      name: 'With MCP Server',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction(
          `For any UI-related change, React component change, styling change, accessibility change, icon change, or design-system question, use the Primer MCP server before editing.`,
        )
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

Then, you will create your scenarios that you are testing the agent behavior
against:

```tsx
// scenarios/uses-button-from-primer/scenario.config.ts

import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent completes the example task',
  prompt: `Example scenario prompt that will instruct the agent to perform a task`,
  tags: ['baseline', 'button', 'primer'],
})

// scenarios/uses-button-from-primer/scenario.test.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

test('example test to see if agent performed the task accurately', () => {
  //
})
```

Scenarios are packages with a `package.json` file. They can be standalone
projects, projects that use Next.js, or anything else. By default, the
dependencies of scenarios are installed and the `build` task is run before the
agent sees the prompt for the scenario.

### Browser tests

Add an optional `browser.test.ts` file when a scenario needs tests in a real
browser. The legacy `scenario.browser.test.ts` filename remains supported.
Agent eval runs browser tests with Playwright after `scenario.test.ts` and
combines both results in the scenario score and test-results artifact.

With everything in place, you can now use the `agent-eval` executable to run
the experiment:

```bash
export COPILOT_GITHUB_TOKEN=... # A GitHub token with access to the Copilot API
npx @primer/agent-eval --experiments ./experiments --experiment example --scenarios ./scenarios
```

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
selects an experiment by its filename without the extension. The experiments
directory defaults to `./experiments`. Use `--scenarios` to set the directory
containing scenario directories; it defaults to `./scenarios`.

Use `--benchmark` to select a benchmark by filename and `--benchmarks` to set
the benchmark directory:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval \
  --benchmarks ./benchmarks \
  --scenarios ./scenarios \
  --benchmark design-system
```

### Result bundles

Keep the output file and artifacts in one directory so results can be moved
between machines without rewriting paths:

```text
run/
├── output.json
└── artifacts/
```

```sh
agent-eval \
  --experiment example \
  --output-dir run
```

Artifact and walkthrough references written by the CLI are relative to the
directory containing `output.json`. Upload or download the complete `run`
directory to preserve those references. `--output-dir` creates `output.json`
and `artifacts/` within the selected directory. When using `--output`, artifacts
are written to an `artifacts/` directory beside the selected file.

## Scenario config authoring

Use `defineConfig` from `@primer/agent-eval/scenario` in each
`scenario.config.ts` file:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate whether the agent uses a Primer button correctly',
  prompt: 'Update the index page to use a primary button',
  tags: ['baseline', 'button', 'primer'],
})
```

Scenario descriptions and tags are optional. Use `description` to explain what
the scenario tests.

## Experiment config authoring

Use `defineConfig` from `@primer/agent-eval/experiment` to keep local experiment
files typed:

```ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Example experiment',
  description: 'Compare treatment behavior',
  models: [{name: 'gpt-5.5', reasoningEfforts: ['low', 'medium', 'high']}],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [],
})
```

Models can be specified by name to use the default `medium` reasoning effort or
with a `name` and `reasoningEfforts` array to run multiple variants.

Scenarios can be selected by ID or loaded directly from a path:

```ts
scenarios: [
  '001-agent-uses-button-from-primer',
  {
    name: 'local-button',
    path: './scenarios/local-button-scenario',
  },
]
```

## Benchmark config authoring

Use `defineConfig` from `@primer/agent-eval/benchmark` to group scenarios into
capabilities:

```ts
import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Design system',
  description: 'Measure agent performance across design system tasks',
  models: ['gpt-5.6-sol'],
  async setup({sandbox}) {
    await sandbox.addAgentSkill('design-system', 'Uses the design system', 'Follow the design system guidance.')
  },
  capabilities: [
    {
      name: 'Uses components',
      scenarios: ['001-agent-uses-button-from-primer'],
      async setup({sandbox}) {
        await sandbox.writeFile('/root/.copilot/component-guidance.md', 'Prefer existing components.')
      },
    },
  ],
})
```

The top-level setup runs first for every benchmark treatment trial. A
capability setup runs next for treatment trials in that capability. Control
trials do not run either setup.

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

Treatment setup can install Copilot plugins from remote Git repositories, local
directories, or remote and local plugin marketplaces. A remote plugin can
optionally specify a branch or tag with `version`:

```ts
await sandbox.addCopilotPlugin({
  type: 'remote',
  url: 'https://github.com/example/copilot-plugin.git',
  version: 'v1.2.3',
})

await sandbox.addCopilotPlugin({
  type: 'local',
  sourcePath: './plugins/copilot-plugin',
})

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
```

Use `{type: 'local', sourcePath: './plugins/local-marketplace'}` as the
marketplace `source` to install from a local marketplace.

## Programmatic APIs

The package root exports explicitly named benchmark, experiment, scenario,
treatment, and trial APIs. Domain entry points are available from
`@primer/agent-eval/benchmark`, `@primer/agent-eval/experiment`,
`@primer/agent-eval/scenario`, and `@primer/agent-eval/sandbox`.

Use the benchmark and experiment entry points for configuration, discovery,
execution, output creation, serialization, and deserialization. Use the
sandbox entry point for `Sandbox`, `SystemSandbox`, `VirtualSandbox`, plugin and
MCP configuration types, and sandbox constants.

The CLI is available through the `agent-eval` executable rather than a
`@primer/agent-eval/cli` package entry point.
