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

### Execution controls

Execution controls are opt-in. Omitting them preserves the existing three retries, walkthrough capture, uncapped candidate session, and generated sandbox image:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval \
  --experiment example \
  --concurrency 1 \
  --fail-fast \
  --max-retries 0 \
  --max-ai-credits 100 \
  --timeout-ms 600000 \
  --no-install-dependencies \
  --no-walkthrough \
  --prepared-image sha256:<64-hex-character-image-id>
```

- `--max-retries 0` runs one attempt with no retries. The default is three retries after the first attempt.
- `--max-ai-credits` passes the Copilot CLI `--max-ai-credits` soft limit to the evaluated candidate session. The minimum is 30. The CLI may finish the process with a non-zero result event or process exit when the budget is exhausted; agent-eval treats either as a failed candidate attempt and preserves the raw output rather than grading it as a failed scenario.
- `--timeout-ms` applies to the complete trial. On timeout, agent-eval disposes that trial's sandbox container before rejecting.
- `--no-install-dependencies` skips the scenario's `npm install`. Use it when a prepared fixture already provides a locked dependency tree that must not be pruned or mutated. Package metadata normalization and the build-if-present step still run.
- `--no-walkthrough` skips the agent-browser installation, walkthrough skill, second Copilot call, and all walkthrough-related sandbox mutations. The result reports `{type: 'Unavailable'}`.
- `--fail-fast` prevents queued trials from starting after a failure. Serial runs (`--concurrency 1`) always have this behaviour.
- `--prepared-image` accepts an existing local `sha256:<64 hex characters>` image ID or a repository digest such as `registry.example/runtime@sha256:<64 hex characters>`. Mutable tags are rejected, the image must already exist locally, and agent-eval does not build or pull a fallback image.

`maxAiCredits` applies only to the evaluated candidate Copilot session. If walkthrough capture remains enabled, its helper session is separate and is not included in the candidate session's limit or usage totals. Disable walkthrough capture when the intended budget covers the whole trial.

All Copilot CLI invocations include `--no-auto-update`, so a version pinned in either the generated sandbox or a prepared image cannot be replaced during a trial.

The equivalent programmatic API is:

```ts
import {runTrial} from '@primer/agent-eval'
import {SystemSandbox} from '@primer/agent-eval/sandbox'

await using sandbox = await SystemSandbox.create({
  preparedImage: 'sha256:<64-hex-character-image-id>',
  network: 'agent-eval-pilot',
})

const result = await runTrial({
  artifactsDirectory: './artifacts',
  copilotToken,
  sandbox,
  trial,
  execution: {
    captureWalkthrough: false,
    installDependencies: false,
    maxAiCredits: 100,
    timeoutMs: 600_000,
  },
})
```

Prepared-image containers are disposable and use `no-new-privileges`, `cap_drop: ALL`, `cap_add: CHOWN`, a 4 GiB memory limit, and a 512-process limit. They do not publish ports or mount host paths. The image must provide the user and writable directories required by the sandbox contract.

`SandboxCreateOptions.network` may be used with `preparedImage` to attach the disposable container to an existing Docker network by setting `HostConfig.NetworkMode`. The caller owns creating and removing that network. No network mode is selected when the option is omitted, and the generated-image path does not accept this option.

Each attempt writes evidence as it runs:

```text
artifacts/<trial-id>/
├── attempts/
│   └── <attempt-number>/
│       ├── attempt.json
│       ├── candidate-logs/
│       ├── candidate-session.json
│       ├── candidate.stderr.log
│       ├── candidate.stdout.log
│       ├── candidate-usage.json
│       ├── candidate-workspace/
│       ├── failure.json
│       ├── redaction.json
│       └── result.json
├── .agents/
├── .copilot/
└── workspace/
```

`candidate.stdout.log`, `candidate.stderr.log`, `candidate-usage.json`, `candidate-logs/`, and `candidate-workspace/` are captured before tests or walkthrough work. The usage file preserves Copilot CLI's `--usage-output-file` output, except that exact occurrences of the execution token are replaced with `[REDACTED]`, and is the source of truth for AI-credit usage. `agent.sessions[].premiumRequests` remains the CLI's premium-request count and must not be interpreted as credits; see github/copilot-cli#4107. If the CLI does not produce a usage file, `candidateUsagePath` is omitted rather than recording zero usage.

The runner redacts exact occurrences of the execution token from persisted stdout, stderr, usage, logs, parsed session data, error metadata, and downloaded text or binary artifacts. `redaction.json` records `redactionApplied: true` when any replacement occurred, so redacted evidence is not presented as an untouched transcript. Known credential-store filenames are excluded from `.copilot` downloads. `candidate-session.json` is written after JSON event parsing and before grading. Failed attempts write `failure.json` with the phase, failure kind, attempt number, retry count, and available artifact paths; successful attempts write `result.json`. Files that are unavailable for a particular failure phase are omitted or empty rather than replaced with a successful-looking result. Agent-eval never enables Copilot CLI gist sharing.

### Result bundles

Keep the output file and artifacts in one directory so results can be moved
between machines without rewriting paths:

```text
run/
├── output.json
└── artifacts/
    └── <trial-id>/
        ├── <trial-id>.json
```

```sh
agent-eval \
  --experiment example \
  --output-dir run
```

`output.json` stores run metadata and maps each trial ID to its JSON file inside
that trial's artifact directory. Each trial file contains agent, model, judge,
test result, artifact, and walkthrough data. Artifact and walkthrough references
are relative to the directory containing `output.json`. Upload or download the complete `run`
directory to preserve those references. `--output-dir` creates `output.json`
and `artifacts/` within the selected directory. When using `--output`, artifacts
are written to an `artifacts/` directory beside the selected file.

Trials include a `judges` array. Each entry preserves the judge's `config`,
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
judge configuration. Benchmark and experiment readers preserve judge results and scenario
judge configurations. Older bundles without judge fields load with empty
`judges` arrays.

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
agent-eval --experiment example --plan plan.json
```

Plan creation does not require a Copilot token. The plan stores the ordered
trial IDs and references needed to reload the experiment or benchmark. Keep the
same experiment, benchmark, and scenario configuration available when running
the plan.

Run deterministic shards from the shared plan, writing a distinct output file
for each shard:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval \
  --from-plan plan.json \
  --shard 1/4 \
  --output-dir run
```

After all shards finish, merge the `output-*.json` files into one portable
result:

```sh
agent-eval --merge-results --output-dir run
```

The merged `output.json` must stay in the same directory as the shard manifests
so their per-trial file references remain portable.

`--plan` and `--from-plan` default to `plan.json` when their path is omitted.
With `--output-dir`, `--shard 1/4` writes `output-1.json`. `--shard` is only
valid with `--from-plan`. Shard merging does not require a Copilot token.

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
