# Getting started

**Use when:** setting up a first evaluation in a new project. Follow the steps
in order. The example is a wiring check, not evidence that a treatment improves
agent performance.

**Completion criteria:** the starter fails its grader, a correct implementation
passes, the saved plan contains two expected trials, and their results can be
read. A blocked live run is incomplete, not a successful evaluation.

## 1. Prepare the environment

In your evaluation project, use Node.js 26 or newer, npm, a running Docker
daemon, and a GitHub token authorized for Copilot and the selected models.
The container also needs network access to download dependencies and reach
Copilot. Set `COPILOT_GITHUB_TOKEN` through your shell or secret manager; never
put a token in a config, fixture, or committed file.

Check Node.js and Docker before installing dependencies:

```sh
node --version
docker info
```

If Docker is unavailable or the token is missing, you can still author the
fixture, validate the grader locally, and create a plan. Do not start a live
run until its prerequisites are available.

For an empty project:

```sh
npm init -y
npm pkg set type=module
npm install --save-dev @primer/agent-eval vitest typescript @types/node
mkdir -p benchmarks experiments scenarios/001-labels
npx agent-eval --help
```

In an existing project, preserve its package setup and use its package manager.
Commands here use npm on the host. The evaluation harness runs `npm install`
inside each scenario container, so fixtures must be independently installable.

The package includes these agent docs. To have your agent load the docs for the
installed version, run from your project's root:

```sh
npx agent-eval agent setup
```

Setup appends an `## agent-eval` section pointing to
`node_modules/@primer/agent-eval/docs/AGENTS.md`. It uses the first existing file
in this order: `AGENTS.md`, `.github/copilot-instructions.md`, or
`copilot-instructions.md`; otherwise it creates `AGENTS.md`. It preserves
existing instructions and encloses the section in comment markers so subsequent
setup runs can update it. Unchanged blocks and existing unmarked guidance are
left alone.

Alternatively, install the discovery skill with
`npx skills add primer/agent-eval --skill agent-eval`. It points to the same
package docs; it does not install the package, Docker, or credentials.

## 2. Create the scenario

Create all five files below; they form one runnable scenario, not independent
snippets. This small Node.js task avoids full application setup.
For application evaluations in the upstream repository, use
`scenarios/000-nextjs-template` as the default starting point, then follow
[scenarios](scenarios.md).

Create `scenarios/001-labels/package.json`:

```json
{
  "name": "labels-fixture",
  "private": true,
  "type": "module",
  "devDependencies": {
    "vitest": "4.1.11"
  }
}
```

Create the starting implementation in `scenarios/001-labels/labels.js`:

```js
export function normalizeLabels(labels) {
  return labels
}
```

Create `scenarios/001-labels/scenario.test.ts`:

```ts
import {expect, test} from 'vitest'
import {normalizeLabels} from './labels.js'

test('trims whitespace and removes empty labels', () => {
  expect(normalizeLabels([' beta ', '', '  ', 'alpha'])).toEqual(['alpha', 'beta'])
})

test('removes duplicates after trimming', () => {
  expect(normalizeLabels(['beta', ' beta ', 'alpha'])).toEqual(['alpha', 'beta'])
})

test('does not mutate the input', () => {
  const input = ['beta', 'alpha']
  expect(normalizeLabels(input)).toEqual(['alpha', 'beta'])
  expect(input).toEqual(['beta', 'alpha'])
})
```

Create `scenarios/001-labels/vitest.config.scenario.ts`:

```ts
import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scenario.test.ts'],
  },
})
```

Create `scenarios/001-labels/scenario.config.ts`:

```ts
import {createVitestCheck, defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  description: 'Smoke-test an agent implementing a small data transformation',
  prompt:
    'Implement normalizeLabels in labels.js. Trim whitespace, remove empty and duplicate labels, and return labels in ascending alphabetical order without changing the input array.',
  checks: [
    createVitestCheck({
      name: 'node-tests',
      configPath: 'vitest.config.scenario.ts',
      testPaths: ['scenario.test.ts'],
    }),
  ],
})
```

`createVitestCheck` lists the config and tests in `files` to keep the grader out
of the implementation agent's initial workspace. The harness restores those
files before running the check; the helper invokes Vitest and returns its outcomes.

## 3. Validate the grader

Before running an agent, execute the fixture's tests locally:

```sh
npx vitest run --root scenarios/001-labels --config vitest.config.scenario.ts
```

Expect three failed assertions for this starter. Temporarily implement a correct
solution and require all three assertions to pass, then restore the starter.
Missing reports, startup errors, and zero tests do not satisfy this check.
Remove generated reports, lockfiles from local-only setup, and caches from the
fixture before evaluating.
Do not leave the solution or previous run evidence in the starting workspace.

## 4. Choose one run configuration

| Goal                    | Create                        | Setup scope                                    |
| :---------------------- | :---------------------------- | :--------------------------------------------- |
| Establish a baseline    | `benchmarks/labels.ts` below  | Top-level setup applies only to `Benchmark`    |
| Compare an intervention | `experiments/labels.ts` below | Treatment setup applies only to that treatment |

Both examples add control automatically. Do not add another control.
Experiment top-level setup, if added, also applies to control; do not put the
tested resource there. Choose one example for the first run.

For a baseline, create `benchmarks/labels.ts`:

```ts
import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Label normalization',
  description: 'Establish a small baseline for data transformation tasks',
  models: [{name: 'gpt-5.4', reasoningEfforts: ['low']}],
  async setup({sandbox}) {
    await sandbox.addAgentInstruction('Before finishing, verify behavior with representative inputs and edge cases.')
  },
  capabilities: [
    {
      name: 'Data transformation',
      scenarios: ['001-labels'],
    },
  ],
})
```

This produces **two trials**: `Control` and `Benchmark`. Benchmark-level setup
only runs in the `Benchmark` treatment.

To compare an intervention instead, create `experiments/labels.ts`:

```ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Verification instructions',
  description: 'Test whether verification instructions improve correctness on a small transformation task',
  models: [{name: 'gpt-5.4', reasoningEfforts: ['low']}],
  scenarios: ['001-labels'],
  treatments: [
    {
      name: 'Verification instructions',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction(
          'Before finishing, verify behavior with representative inputs and edge cases.',
        )
      },
    },
  ],
})
```

This also produces **two trials**: the automatic `Control` plus the configured
treatment.

## 5. Inspect the plan and run

Planning loads and validates configs without starting containers or calling
Copilot:

```sh
npx agent-eval experiment plan create labels --output-path ./labels-plan.json
```

Inspect `labels-plan.json`: it should have two trials with the same scenario,
model, effort, and runner, but different treatment IDs. Plans are not
self-contained snapshots; retain the configs, fixture, and pinned resources.

Once `COPILOT_GITHUB_TOKEN` is available:

```sh
npx agent-eval experiment plan run \
  --plan-path ./labels-plan.json \
  --output-dir ./results/labels-first-run
```

For the benchmark alternative, create and inspect its plan, then execute it:

```sh
npx agent-eval benchmark plan create labels --output-path ./labels-benchmark-plan.json
npx agent-eval benchmark plan run --plan-path ./labels-benchmark-plan.json --output-dir ./results/labels-baseline
```

The benchmark plan also contains two trials, with a capability ID on each.
Use a new output directory for every run.

To smoke-test just the scenario instead, use the command below. It uses a
built-in model, **not** the benchmark or experiment's model or setup:

```sh
npx agent-eval scenario run 001-labels --output-dir ./results/labels-scenario
```

Use an experiment when model selection matters.

## 6. Verify completion

For either two-trial comparison:

- Open `output.json` in the chosen directory and resolve both `trials` entries
  to their `artifacts/<trial-id>/<trial-id>.json` files.
- Confirm each trial contains three `node-tests` outcomes with assertion IDs.
  Count passed, failed, and skipped outcomes separately from evaluator errors.
- Compare the two conditions and inspect saved workspaces and sessions before
  explaining any difference. The agent is not required to pass every test for
  the evaluation itself to have completed correctly.

Scenario output instead embeds results in `{id, results}`; see
[trials and results](trials-and-results.md). The harness attempts a walkthrough
even for this non-UI example. Unavailable visual evidence is not a failed test.

Next, replace the smoke task with a representative task from your project and
apply the [methodology](overview.md). See [CLI troubleshooting](cli.md) if setup,
discovery, authentication, or grading fails.
