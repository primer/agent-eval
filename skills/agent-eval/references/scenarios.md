# Scenarios

**Use when:** creating or changing an agent task, its starting workspace, or its
evaluation. Benchmarks and experiments reuse the same scenario across treatments.

## Contract

| Item              | Rule                                                              |
| :---------------- | :---------------------------------------------------------------- |
| Required files    | `package.json` and `scenario.config.ts`                           |
| Import and export | `defineConfig` from `@primer/agent-eval/scenario`; default export |
| Required field    | `prompt`, passed to the implementation agent                      |
| Optional fields   | `description`, `tags`, `checks`, `judges`                         |
| Defaults          | Empty tags, checks, and judges                                    |
| Identity          | Directory name by default                                         |
| Evaluation files  | Declare in check/judge `files`; restored during evaluation        |

Add [checks](checks.md), [judges](judges.md), or both before treating a run as a
quality evaluation. Empty graders are valid configuration but provide no
quality verdict. `scenario.test.ts` is needed only when a check uses it.

## Runnable example

Use the complete `001-labels` fixture in [getting started](getting-started.md):
package manifest, starter implementation, private tests, Vitest configuration,
and scenario configuration with the `node-tests` check. The commands below
refer to that fixture; a prompt-only configuration is not an equivalent substitute.

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

## Run

Use `scenario.test.ts` and `vitest.config.scenario.ts` for the standard
deterministic-check pattern in [getting started](getting-started.md). Validate
baseline failures and a representative correct implementation before spending
on agent runs.

```sh
npx agent-eval scenario run 001-labels --output-dir ./results/labels-smoke
```

Alternatively, select the example fixture's `node-tests` check:

```sh
npx agent-eval scenario run 001-labels --check node-tests --output-dir ./results/labels-check
```

## Verify

- The fixture installs independently and builds before the agent runs.
- The grader reports intended starter failures and accepts a correct solution.
  Restore the starter and remove local reports before execution.
- The run's `output.json` contains a scenario result with individual check
  outcomes. Inspect failures and evaluation errors separately.

## Pitfalls

`--check` selects one configured check but still runs the agent task and later
stages; it is not a local test-only command and does not disable judges.
Standalone scenario execution uses a built-in model and no benchmark or
experiment setup. Use an experiment to select models and compare resources.

Tags are metadata, not a CLI selection mechanism. `description` explains the
evaluation; it is not a second implementation prompt.
