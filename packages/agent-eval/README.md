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

### Check outcomes

A scenario check can return `{outcomes: [...]}`. Each outcome has
`type: 'outcome'`, a `passed`, `failed`, or `skipped` status, and an
optional `id`. For per-file checks, return one entry per checked file and use
its file path as the ID. Existing outcomes without IDs remain supported.

For numeric results, return `{measurements: [...]}` with entries containing
`type: 'measurement'` and a numeric `value`. Measurement groups can also include
`unit` and `direction` (`higher-is-better` or `lower-is-better`).
Both arrays support `{type: 'error', message: '...'}` entries.

Return exactly one of `outcomes` or `measurements` per group, without a group-level
`type`. A check can return one group with an optional `id`, or an array of groups
with a required `id` on each. Config parsing wraps the check callback to normalize
each returned group to `{type: 'outcomes', outcomes: [...]}` or
`{type: 'measurements', measurements: [...]}`.
The runtime `check.run` always returns an array of these normalized groups,
even when the configured callback returns a single group. A single group without
an `id` remains valid, and an empty array remains empty.

### Browser tests

Add an optional `browser.test.ts` file when a scenario needs tests in a real
browser. The legacy `scenario.browser.test.ts` filename remains supported.
Agent eval runs browser tests with Playwright after `scenario.test.ts` and
combines both results in the scenario score and test-results artifact.

With everything in place, you can now use the `agent-eval` executable to run
the experiment:

```bash
export COPILOT_GITHUB_TOKEN=... # A GitHub token with access to the Copilot API
npx @primer/agent-eval experiment run example --experiments ./experiments --scenarios ./scenarios
```

## CLI

Install the package and run the `agent-eval` binary with a GitHub token:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval experiment run example \
  --experiments ./experiments \
  --scenarios ./scenarios
```

Use `--experiments` to load experiment files from a local directory. Experiment
files may export an `experiment` named export or a default export. The positional
name selects an experiment by its filename without the extension. The experiments
directory defaults to `./experiments`. Use `--scenarios` to set the directory
containing scenario directories; it defaults to `./scenarios`.

Use `benchmark run` to select a benchmark by filename and `--benchmarks` to set
the benchmark directory:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval benchmark run design-system \
  --benchmarks ./benchmarks \
  --scenarios ./scenarios
```

### Run reports

Both `run` and `plan run` commands print a report after saving their result
bundle. Experiment reports group results by treatment, scenario, and model.
Benchmark reports group results by capability, scenario, and model, with usage
changes relative to the control treatment. Plan-run reports cover only the
selected shard.

Usage columns sum `outputTokens`, `premiumRequests`, `sessionDurationMs`, and
`totalApiDurationMs` across each trial's `agent.sessions`. Judge sessions are
excluded. Benchmark percentage changes use `(benchmark - control) / control`;
a missing comparison side or a zero baseline with a nonzero treatment value
is shown as `N/A`. Run counts are included so unequal shard sizes are visible.

Reports currently include run counts and agent usage only, without judge scores
or test results.

### Result bundles

Keep the output file and artifacts in one directory:

```text
run/
├── output.json
└── artifacts/
    └── <trial-id>/
        ├── <trial-id>.json
```

```sh
agent-eval experiment run example \
  --output-dir run
```

`output.json` stores the experiment's filename-based `id`, scenario and treatment
metadata, and a map of trial IDs to JSON files relative to the output directory.
Treatments use stable IDs derived from their names. Each trial file contains
agent, model, judge, artifact, and walkthrough data. Artifact paths inside trial
files retain their runtime locations. `--output-dir` creates `output.json` and
`artifacts/` within the selected directory.

Trials include a `judges` array. Each entry preserves the `judge` configuration,
`result`, and `agent.session` (including its messages and usage). Judge sessions
are separate from the implementation agent's sessions. Successful results have
`type: "result"` with a `score`, `rationale`, and file-backed `findings`. Missing
reports have `type: "unknown"`; malformed reports and scores outside the
configured scale have `type: "error"` with a diagnostic `message`.

Judge reports are read from the sandbox workspace before artifacts are
downloaded. Reports contain `score`, `rationale`, and `findings`; the runner adds
the result type. The original reports are also retained in the downloaded
workspace as `judge-<sha256>-report.json`, using the SHA-256 hex digest of the
judge's name to keep filenames path-safe. The original name is preserved in the
judge configuration. Experiment output preserves judge results and scenario
judge configurations.

### Judge reference files

Use `files` on a judge entry to provide reference screenshots, text files, or
directories:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Build a project overview page.',
  judges: [
    {
      name: 'visual-match',
      files: ['screenshots', 'references/notes.txt'],
      judge: {
        instructions: 'Compare the implementation with the reference screenshots and notes.',
      },
      scores: [
        {value: 0, description: 'The implementation does not match the references.'},
        {value: 1, description: 'The implementation matches the references.'},
      ],
    },
  ],
})
```

Paths are relative to the scenario directory and use forward slashes. These are
literal file or directory paths, not glob patterns. Directories are copied
recursively. References are excluded from the implementation workspace and
copied to the same relative workspace paths during the judge phase, after
deterministic tests finish. The judge prompt identifies them as reference
material, not implementation output. Shared references are copied once.

Use dedicated reference paths that the implementation will not create.
Missing references, symbolic links, absolute paths, parent traversal, and paths
that would overwrite existing workspace content fail the trial explicitly.
Reference files remain in the downloaded workspace, and `files` is preserved in
saved judge configurations. For findings based on images, judges use an empty
`snippet` and describe the visual evidence in `explanation`.

### Plans and sharding

Create a durable, randomized trial plan before running an experiment or
benchmark:

```sh
agent-eval experiment plan create example --output-path plan.json
```

Plan creation does not require a Copilot token. The plan stores the ordered
trial IDs and references needed to reload the experiment or benchmark. Keep the
same experiment, benchmark, and scenario configuration available when running
the plan.

Run deterministic shards from the shared plan, writing a distinct output file
for each shard:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval experiment plan run \
  --plan-path plan.json \
  --shard 1/4 \
  --output-dir run
```

After all shards finish, merge the `output-*.json` files into one
result:

```sh
agent-eval experiment merge --output-dir run
```

The merge writes `output.json` before removing the shard manifests. Trial
artifact files remain in place.

`--output-path` and `--plan-path` default to `plan.json`. With `--output-dir`,
`--shard 1/4` writes `output-1.json`. `--shard` is only available on
`experiment plan run`. Shard merging does not require a Copilot token.
Use `--experiments` and `--scenarios` on both plan commands when loading
configuration from custom directories. Benchmark commands use the same
`benchmark plan create`, `benchmark plan run`, and `benchmark merge` structure.

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

Each model and scenario runs once per configured treatment and once with the
automatic `Control` treatment. Treatment names must be unique; `Control` is
reserved. A top-level `setup` runs before treatment setup for every trial,
including control trials. Treatment configs only need a name and optional setup;
IDs are assigned when the experiment is loaded.

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

Use `defineConfig` from `@primer/agent-eval/benchmark` or
`@primer/agent-eval/experiment` to author configuration. These entry points expose
configuration helpers; use the CLI for discovery, execution, planning, and
merging results.

The scenario entry point, `@primer/agent-eval/scenario`, exports only
`defineConfig`. Scenario loading, discovery, schemas, and runtime types are
internal; select scenarios through benchmark or experiment configuration.
Use `@primer/agent-eval/sandbox` for sandbox runtime and types.

The CLI is available through the `agent-eval` executable rather than a
`@primer/agent-eval/cli` package entry point.
