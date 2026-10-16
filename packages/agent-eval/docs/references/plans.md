# Plans

**Use when:** inspecting a trial matrix, separating planning from execution, or
distributing a run across workers. Direct `run` remains available for small
evaluations.

## Contract

| Item             | Rule                                                                           |
| :--------------- | :----------------------------------------------------------------------------- |
| Input            | An existing benchmark/experiment and resolvable scenarios                      |
| Manifest         | Configuration ID/name and uniquely identified trial combinations               |
| Trial dimensions | Scenario, treatment, model/effort, runner; also capability for benchmarks      |
| Plan creation    | Loads configs and validates references; no containers, setup hooks, or Copilot |
| Plan execution   | Reloads local configs and resolves saved identifiers                           |
| Shards           | One-based `order/total`; assignment by trial position                          |

Load only trusted configurations: creation executes their top-level module code
even though it does not execute trials.

A plan is **not** a snapshot of the fixture, setup functions, dependencies, or
resource contents. Execution reloads local configurations and resolves the
saved identifiers. Preserve the source revision, dependency versions, resource
contents, and directory layout with the plan.

Configuration IDs come from filenames. Capability and treatment IDs depend on
their names. Renaming or removing referenced entities can invalidate a plan.

## Create and run

The following command templates require an existing experiment named
`comparison`; substitute your config ID. Replace `experiment` with `benchmark`
for a benchmark plan:

```sh
npx agent-eval experiment plan create comparison --output-path ./comparison-plan.json
```

Inspect the trial count, IDs, and dimensions before running:

```sh
npx agent-eval experiment plan run --plan-path ./comparison-plan.json --output-dir ./results/comparison-01
```

## Shard and merge

As an alternative to the whole-plan run, execute on separate workers using the
same plan. Use a fresh output directory, not one from a previous full run:

```sh
npx agent-eval experiment plan run --plan-path ./comparison-plan.json --shard 1/2 --output-dir ./results/comparison-01
npx agent-eval experiment plan run --plan-path ./comparison-plan.json --shard 2/2 --output-dir ./results/comparison-01
```

Shard numbers are one-based. Each worker uses the same total and a different
order. Assignment is based on trial position, balancing trial count rather
than execution time. `--runner` filters after assignment; it does not move
trials between shards.

Each worker writes `output-<order>.json` plus `artifacts/`. Collect both workers'
complete output directories into one directory without changing the layout:

```text
results/comparison-01/
  output-1.json
  output-2.json
  artifacts/
    <trial-id>/
      <trial-id>.json
      ...
```

Only merge after every expected shard and its complete artifacts are collected.
Use consistent absolute checkout/output paths across workers and the merge
machine; artifact metadata contains absolute paths used by the writer.

Merge validates manifest IDs, trial ID uniqueness, and shared metadata consistency
before reading artifacts. Metadata IDs must match their record keys; benchmark
capabilities must have distinct scenario IDs. Conflicting capability, scenario, or
treatment metadata is rejected with schema errors identifying the affected fields.
Identical metadata across shards is allowed.

**Merge overwrites `output.json` and deletes shard manifests after success.**
It keeps trial artifacts. Use a dedicated output directory:

```sh
npx agent-eval experiment merge --output-dir ./results/comparison-01
```

## Programmatic use

The main `@primer/agent-eval` entrypoint exports the same planning, execution,
output, and report helpers used by the CLI:

- Create plans with `createBenchmarkPlan`, `createExperimentPlan`, or
  `createScenarioPlan`.
- Save benchmark or experiment plans with `createBenchmarkPlanManifest` or
  `createExperimentPlanManifest`, then reload them with the corresponding
  `parseBenchmarkPlanManifest` or `parseExperimentPlanManifest`.
- Select saved trials with `selectPlanTrials` and `parseShard`, then pass them to
  `createPlanFromManifest`. Execute a plan with `runPlan`.
- Build result bundles with `createBenchmarkOutput` or `createExperimentOutput`
  and persist them with `writeBenchmarkOutput` or `writeExperimentOutput`.
- Generate text reports with `createBenchmarkReport` or `createExperimentReport`.

For example, select a saved benchmark shard without starting containers:

```ts
import {readFile} from 'node:fs/promises'
import {createPlanFromManifest, parseBenchmarkPlanManifest, parseShard, selectPlanTrials} from '@primer/agent-eval'

const manifest = await parseBenchmarkPlanManifest({
  benchmarksDirectory: '/workspace/benchmarks',
  scenariosDirectory: '/workspace/scenarios',
  contents: await readFile('/workspace/plan.json', 'utf-8'),
})
const plan = createPlanFromManifest({
  trials: selectPlanTrials({
    trials: manifest.trials,
    shard: parseShard('1/2'),
  }),
})
```

`runPlan` requires a Copilot token and artifact directory. It accepts the same
per-worker Copilot and container concurrency limits described in [CLI](cli.md).

## Verify

- Before execution, the plan contains the intended combinations and unique IDs.
- Before merge, the collected trial IDs match the expected plan selection with
  no missing or duplicated trials.
- After execution or merge, every `output.json` trial path resolves to a readable
  result file, and referenced artifacts exist.

## Pitfalls

Concurrency limits apply per worker. See [CLI](cli.md) before increasing them.
Shards balance trial counts, not execution time. A successful merge alone does
not establish that you collected the entire intended plan.
