# Scenarios

**Use when:** creating or changing an agent task, its starting workspace, or its
evaluation. Benchmarks and experiments reuse the same scenario across treatments.

## Contract

| Item              | Rule                                                              |
| :---------------- | :---------------------------------------------------------------- |
| Required files    | `package.json` and `scenario.config.ts`                           |
| Import and export | `defineConfig` from `@primer/agent-eval/scenario`; default export |
| Required field    | `prompt`, passed to the implementation agent                      |
| Optional fields   | `description`, `tags`, `workspace`, `checks`, `judges`            |
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

By default, the harness generates a Docker image that copies the scenario,
uses the neutral package name `agent-eval-scenario`, removes
`devDependencies.@primer/agent-eval`, and runs `npm install`.
Each trial starts a fresh container from that image and replaces the package
name with the trial ID before setup hooks. Do not use other unresolved workspace dependencies or require
files outside the fixture. Dependencies for tests belong in the fixture
manifest even though their tests are withheld.

After shared and treatment setup, `npm run build --if-present` runs before the
agent task. The starting project must build successfully. This is not a
post-implementation build check; configure that separately if needed.

Prebuild with `npx agent-eval scenario build <name>` or omit the name to build
all scenarios. Docker is required, but a Copilot token is not. Each image is
printed as JSON with `scenario` and `image`. The library equivalent is
`buildScenarioImage({scenario})`, exported from the package root and
`@primer/agent-eval/scenario`.

Later runs rebuild against current inputs using Docker's cached layers.
Prebuilding does not run setup hooks or the post-setup build. Installation
scripts execute during image construction and cannot depend on a trial ID.
For cross-machine reuse, tag/push the returned image and set `workspace.image`;
that explicit image must own its initial build.

### Image-backed workspaces

Set `workspace: {source: 'image', image: 'ghcr.io/example/project:tag'}` to use
an image-provided project. Alternatively, set
`workspace: {source: 'image', dockerfile: './Dockerfile', context: '.'}`.
Specify exactly one of `image` and `dockerfile`. Both local paths are relative
to the scenario directory; context defaults to that directory and must contain
the Dockerfile. Its `.dockerignore` filters the build context.

The image owns project layout, dependency installation, and the initial build
at `/home/sandbox/workspace`. The harness skips the initial scenario copy,
package rewriting, npm install, and npm build. Use Dockerfile `COPY` instructions
to select fixture files without overwriting the project's manifest.
Do not bake private grading files into the image.

Shared/treatment hooks and check/judge file injection still run. Evaluation file
paths remain relative to the container workspace root, regardless of where the
Dockerfile places application files. Artifact collection is unchanged.
Scenario images override `--docker-image`. Local images build once per scenario
per run; later runs rebuild using Docker's cache.
The image must satisfy the [sandbox runtime contract](sandbox.md).

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
