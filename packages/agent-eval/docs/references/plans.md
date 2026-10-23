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
Newly written artifact and walkthrough paths are relative to the output directory.
Workers and the merge machine can use different checkout/output paths as long as
the bundle layout is preserved. Historical bundles with absolute artifact paths
still require those paths to be available.

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

After merging, use `npx agent-eval experiment retry --output-dir
./results/comparison-01` to retry only execution errors without recreating the
plan or rerunning completed trials. Use `benchmark retry` for benchmark bundles.
See [retry](cli.md#retry-an-incomplete-evaluation) for details.

## Verify

- Before execution, the plan contains the intended combinations and unique IDs.
- Before merge, the collected trial IDs match the expected plan selection with
  no missing or duplicated trials.
- After execution or merge, every `output.json` trial path resolves to a readable
  success or error result. Failed trials remain present through merges; only
  successful trials reference artifacts.

## Pitfalls

Concurrency limits apply per worker. See [CLI](cli.md) before increasing them.
Shards balance trial counts, not execution time. A successful merge alone does
not establish that you collected the entire intended plan.
