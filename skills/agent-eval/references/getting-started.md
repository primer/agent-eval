# Getting started

## Install the skill and runtime

Install this skill into your agent's environment:

```sh
npx skills add primer/agent-eval --skill agent-eval
```

Keep the entire `agent-eval` skill directory, including `references`. Installing
the skill does **not** install the evaluation package, Docker, or credentials.

In your evaluation project, use Node.js 26 or newer, npm, a running Docker
daemon, and a GitHub token authorized for Copilot and the selected models.
The container also needs network access to download dependencies and reach
Copilot. Set `COPILOT_GITHUB_TOKEN` through your shell or secret manager; never
put a token in a config, fixture, or committed file.

For an empty project:

```sh
npm init -y
npm pkg set type=module
npm install --save-dev @primer/agent-eval vitest typescript @types/node
mkdir -p benchmarks experiments scenarios/001-labels
node --version
docker info
npx agent-eval --help
```

In an existing project, preserve its package setup and use its package manager.
Commands here use npm on the host. The evaluation harness runs `npm install`
inside each scenario container, so fixtures must be independently installable.

## Create a small scenario

This deliberately small Node.js example checks the evaluation wiring before
spending time on a full application. It is not evidence that a treatment improves
performance. For application evaluations in the upstream repository, use
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
    reporters: [['json', {outputFile: 'vitest-scenario-report.json'}]],
  },
})
```

Create `scenarios/001-labels/scenario.config.ts`:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'
import type {JsonTestResults} from 'vitest/reporters'

export default defineConfig({
  description: 'Smoke-test an agent implementing a small data transformation',
  prompt:
    'Implement normalizeLabels in labels.js. Trim whitespace, remove empty and duplicate labels, and return labels in ascending alphabetical order without changing the input array.',
  checks: [
    {
      name: 'node-tests',
      files: ['scenario.test.ts', 'vitest.config.scenario.ts'],
      async run({sandbox}) {
        const command = await sandbox.runCommand('npx', ['vitest', 'run', '--config', 'vitest.config.scenario.ts'], {
          allowNonZeroExitCode: true,
        })
        if (command.exitCode !== 0 && command.exitCode !== 1) {
          throw new Error(`Vitest failed with exit code ${command.exitCode}: ${command.stderr}`)
        }
        const report: JsonTestResults = JSON.parse(await sandbox.readFile('vitest-scenario-report.json'))
        if (report.numTotalTests === 0 || (command.exitCode !== 0 && report.numFailedTests === 0)) {
          throw new Error(`Vitest did not produce usable test outcomes: ${command.stderr}`)
        }
        return {
          outcomes: report.testResults.flatMap(({assertionResults}) => {
            return assertionResults.map(assertion => {
              return {
                type: 'outcome',
                id: assertion.fullName,
                status: assertion.status === 'passed' ? 'passed' : assertion.status === 'failed' ? 'failed' : 'skipped',
              }
            })
          }),
        }
      },
    },
  ],
})
```

`files` keeps the grader out of the implementation agent's initial workspace.
The harness restores those files before running the check. There is no implicit
test runner: the check explicitly invokes Vitest and returns its outcomes.

Before running an agent, execute the fixture's tests locally:

```sh
npx vitest run --root scenarios/001-labels --config vitest.config.scenario.ts
```

Failures are expected for this starter. Temporarily implement a correct solution
to confirm the grader passes, then restore the starter. Remove generated reports,
lockfiles from local-only setup, and caches from the fixture before evaluating.
Do not leave the solution or previous run evidence in the starting workspace.

## Choose a benchmark or experiment

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
treatment. Do not add another control. Run either configuration first, not both
unless you want both results.

## Inspect, run, and read the result

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

For the benchmark alternative:

```sh
npx agent-eval benchmark run labels --output-dir ./results/labels-baseline
```

To smoke-test just the scenario:

```sh
npx agent-eval scenario run 001-labels --output-dir ./results/labels-scenario
```

The standalone scenario command uses a built-in model; it does not read the
benchmark or experiment's model or setup. Use an experiment for model selection.

For a benchmark or experiment, open `output.json` in the chosen directory and
follow the paths in `trials` to `artifacts/<trial-id>/<trial-id>.json`.
Compare check outcomes for both treatments, then inspect the saved workspaces
and sessions to understand failures. Scenario output has a different shape;
see [trials and results](trials-and-results.md).

Use a new output directory for each run. An evaluation completing successfully
does not mean all checks passed. The harness also attempts a visual walkthrough,
even for this non-UI example; unavailable visual evidence is not a failed test.

Next, replace the smoke task with a representative task from your project and
apply the [methodology](overview.md). See [CLI troubleshooting](cli.md) if setup,
discovery, authentication, or grading fails.
