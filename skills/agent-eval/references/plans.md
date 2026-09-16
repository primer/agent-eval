# Plans

A plan is a durable list of trials, separating what to run from execution.
Use direct `run` for a small evaluation; save a plan to inspect its matrix,
run it later, or distribute trials across workers.

```sh
npx agent-eval experiment plan create comparison --output-path ./comparison-plan.json
npx agent-eval experiment plan run --plan-path ./comparison-plan.json --output-dir ./results/comparison-01
```

Replace `experiment` with `benchmark` for a benchmark plan. Creation loads
configuration and validates references but does not run treatment setup,
containers, or Copilot. It does execute top-level code in config modules, so
load only trusted configurations.

## Identity and reproducibility

The manifest records the configuration ID/name and trial IDs with scenario,
treatment, model/effort, and runner identifiers. Benchmark trials also identify
their capability. Trial IDs must be unique.

A plan is **not** a snapshot of the fixture, setup functions, dependencies, or
resource contents. Execution reloads local configurations and resolves the
saved identifiers. Preserve the source revision, dependency versions, resource
contents, and directory layout with the plan.

Configuration IDs come from filenames. Capability and treatment IDs depend on
their names. Renaming or removing referenced entities can invalidate a plan.

## Shard and merge

On separate workers using the same plan:

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

Then merge:

```sh
npx agent-eval experiment merge --output-dir ./results/comparison-01
```

Merge writes `output.json`, overwrites an existing combined output, and deletes
shard manifests after success. It keeps trial artifacts. Only merge after all
expected shards are collected, and use a dedicated output directory.

Use consistent absolute checkout/output paths across workers and the merge
machine: artifact metadata currently contains absolute paths used by the
writer. Keep the complete artifact tree, not just JSON manifests.

Concurrency limits apply per worker. See [CLI](cli.md) before increasing them.
