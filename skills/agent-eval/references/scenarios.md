# Scenarios

**Use when:** creating or changing an agent task, its starting workspace, or its
evaluation. Benchmarks and experiments reuse the same scenario across treatments.

## Contract

| Item              | Rule                                                              |
| :---------------- | :---------------------------------------------------------------- |
| Required files    | `package.json` and `scenario.config.ts`                           |
| Import and export | `defineConfig` from `@primer/agent-eval/scenario`; default export |
| Required field    | `prompt`, passed to the implementation agent                      |
| Optional fields   | `description`, `tags`, `checks`, `judges`, `image`, `setup`       |
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

By default, the harness builds an image containing the scenario files. Its
default scenario setup replaces the package name with `example`, removes
`devDependencies.@primer/agent-eval`, runs `npm install`, and then runs
`npm run build --if-present`. Do not use other unresolved workspace dependencies
or require files outside the fixture. Dependencies for tests belong in the
fixture manifest even though their tests are withheld.

Scenario setup runs before shared and treatment setup. The starting project
must build successfully. This is not a post-implementation build check;
configure that separately if needed.

## Customize the image

Set `image: 'node:26-slim'` (or `image: {name: 'node:26-slim'}`) in
`defineConfig` to use an existing base image. To build your own:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add a search feature that filters the list of projects by name.',
  image: {
    dockerfile: 'Dockerfile',
    context: '.',
  },
})
```

Dockerfile and context paths accept absolute paths or paths relative to the
scenario directory. `context` defaults to `.`. With an image reference, the
harness copies the scenario files into `/home/sandbox/workspace`. With a
Dockerfile, copy the project to that location yourself.

Setting `image` disables default scenario setup. Prepare dependencies and build
the project in the Dockerfile or an explicit scenario `setup` callback.
An explicit `setup` also replaces default setup when `image` is omitted.

The sandbox adds Copilot tools to the resulting image and currently requires
a Debian-compatible base with `apt-get`, npm, and a `node` user and group with
UID/GID `1000`. Use a Debian-based official Node.js image, not Alpine.

## Keep grading private

List every grader-owned file and helper in a check's or judge's `files`.
These are withheld during implementation and copied in for evaluation.
Paths must exist inside the scenario directory, remain inside after resolving
symlinks, and must not themselves be symlinks.

The harness also excludes `scenario.config.ts`, `node_modules`, `.cache`,
`.next`, `.turbo`, and `dist` from the initial build context. Conventional test
filenames are not automatically excluded; declare them in check/judge `files`.
Do not rely on this short list as a general cleanup policy. Remove cached
reports, screenshots, old answers, and other artifacts yourself.

Avoid leaving grader instructions in visible package scripts or fixture docs.
Keep the same prompt and workspace for control and treatment; put resource
knowledge in [treatment setup](treatments.md).

## Run

Optionally build the starting workspace image before an evaluation, without
running setup callbacks or an agent:

```sh
npx agent-eval scenario image build 001-labels
```

Evaluation runs build the image automatically. Use
`npx agent-eval scenario image clean 001-labels` to remove local images for that
scenario. See [CLI image commands](cli.md#scenario-images) for directory options
and the broader cleanup scope when the name is omitted.

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
