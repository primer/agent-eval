# Scenarios

A scenario is one task: prompt, starting workspace, and evaluation. Both
benchmarks and experiments reuse it without changing the task between
treatments.

## Files and configuration

A discoverable scenario directory needs `package.json` and
`scenario.config.ts`. It does not require `scenario.test.ts` unless your
configured checks use that file.

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Evaluate adding search to an existing list',
  prompt: 'Add search so users can filter the list of projects by name.',
  tags: ['search'],
  checks: [],
  judges: [],
})
```

`prompt` is required; `description`, `tags`, `checks`, and `judges` are optional.
Use a default export. Empty checks and judges are valid configuration but give
you no quality verdict. Add [checks](checks.md), [judges](judges.md), or both
before interpreting a run as an evaluation.

`description` records what is being tested; the implementation agent receives
`prompt`. Tags are metadata, not a CLI selection mechanism. Scenario IDs are
directory names by default.

## Build the starting workspace

For a new application task, use framework scaffolding without a completed
feature, answer-revealing stubs, TODO instructions, or generated artifacts.
For a modification task, include only the realistic pre-change behavior.

The upstream default is
[000-nextjs-template](https://github.com/primer/agent-eval/tree/main/scenarios/000-nextjs-template).
When adding scenarios there, use the next available numbered directory and
retain the Vitest check pattern. In another repository, copy or scaffold a
self-contained fixture; do not assume the upstream template exists locally.
Replace upstream-only `workspace:*` dependency references before installing
the fixture outside that workspace.

The harness copies the scenario into the container, replaces the package name
with the trial ID, removes `devDependencies.@primer/agent-eval`, and runs
`npm install`. Do not use other unresolved workspace dependencies or require
files outside the fixture. Dependencies for tests belong in the fixture
manifest even though their tests are withheld.

After shared and treatment setup, `npm run build --if-present` runs before the
agent task. The starting project must build successfully. This is not a
post-implementation build check; configure that separately if needed.

## Keep grading private

List every grader-owned file and helper in a check's or judge's `files`.
These are withheld during implementation and copied in for evaluation.
Paths must exist inside the scenario directory, remain inside after resolving
symlinks, and must not themselves be symlinks.

The harness also excludes `scenario.config.ts`, conventional scenario test
filenames, `node_modules`, `.next`, and `dist` from the initial copy.
Do not rely on this short list as a general cleanup policy. Remove cached
reports, screenshots, old answers, and other artifacts yourself.

Avoid leaving grader instructions in visible package scripts or fixture docs.
Keep the same prompt and workspace for control and treatment; put resource
knowledge in [treatment setup](treatments.md).

## Validate and run

Use `scenario.test.ts` and `vitest.config.scenario.ts` for the standard
deterministic-check pattern in [getting started](getting-started.md). Validate
baseline failures and a representative correct implementation before spending
on agent runs.

```sh
npx agent-eval scenario run 001-search --output-dir ./results/search-smoke
npx agent-eval scenario run 001-search --check node-tests --output-dir ./results/search-check
```

`--check` selects one configured check but still runs the agent task and later
stages; it is not a local test-only command and does not disable judges.
Standalone scenario execution uses a built-in model and no benchmark or
experiment setup. Use an experiment to select models and compare resources.
