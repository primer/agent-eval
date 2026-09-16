# Plan

A plan is a saved list of trials for a [benchmark](./benchmarks.md) or [experiment](./experiments.md). Each trial identifies a scenario, model, and treatment to evaluate. Benchmark trials also identify the capability being evaluated.

Plans separate deciding what to run from running it. This lets you inspect the trials ahead of time, run them later, or split the work across multiple machines or CI jobs.

For small evaluations, you can use `agent-eval benchmark run` or `agent-eval experiment run` directly. Saving a plan is useful when an evaluation is too large for one machine or one CI job. You create the plan once, divide its trials into shards, and run each shard independently. When every shard finishes, you merge their results into one result bundle.

## Create a plan

The following example creates a plan for `benchmarks/example.ts`:

```bash
agent-eval benchmark plan create example --output-path ./plan.json
```

For an experiment in `experiments/example.ts`, use:

```bash
agent-eval experiment plan create example --output-path ./plan.json
```

The name is the configuration filename without its extension. By default, the CLI looks for configurations in `./benchmarks` or `./experiments` and scenarios in `./scenarios`.

Creating a plan writes a JSON manifest without running the trials. It includes the configured combinations of scenarios, models, and treatments, including the automatically added control treatment.

## Run a plan

To run every trial in a saved benchmark plan:

```bash
agent-eval benchmark plan run \
  --plan-path ./plan.json \
  --output-dir ./results/example
```

For an experiment plan, replace `benchmark` with `experiment`.

Without `--shard`, the command runs the whole plan and writes `output.json` and an `artifacts/` directory to the output directory. No merge step is needed.

### Split the work into shards

Use `--shard <order>/<total>` to run one part of the plan. Shard numbers start at `1`. For two workers, run the following commands on separate workers using the same plan:

```bash
# Worker 1
agent-eval benchmark plan run \
  --plan-path ./plan.json \
  --shard 1/2 \
  --output-dir ./results/example
```

```bash
# Worker 2
agent-eval benchmark plan run \
  --plan-path ./plan.json \
  --shard 2/2 \
  --output-dir ./results/example
```

Every worker must use the same total shard count, with a different shard number. Trials are distributed by their position in the saved plan, so each trial belongs to exactly one shard. This divides the trial count, not necessarily the execution time.

Sharding distributes work across processes or machines. Within each worker, `--copilot-concurrency` controls the maximum number of concurrent Copilot sessions and `--container-concurrency` controls the maximum number of trial containers. These limits apply per worker, not across the entire evaluation.

Each shard writes `output-<order>.json` and its trial artifacts. For example, shard `1/2` writes `output-1.json`.

## Merge the results

After all shards finish, collect their output files and artifact directories into one output directory. Preserve the directory layout so each shard manifest can resolve its trial files:

```text
results/example/
  output-1.json
  output-2.json
  artifacts/
    <trial-id>/
      <trial-id>.json
      ...
```

Copy the complete `artifacts/` contents from every worker, not just the `output-<order>.json` files. In CI, upload each worker's output directory and download the artifacts into a common directory in a merge job.

Use the same absolute checkout and output paths on the workers and the merge machine. Trial metadata currently includes absolute artifact paths that the merge writer uses.

Then merge the benchmark results:

```bash
agent-eval benchmark merge --output-dir ./results/example
```

For experiment results:

```bash
agent-eval experiment merge --output-dir ./results/example
```

The merge command reads the `output-<order>.json` files and their referenced trial files, then writes a combined `output.json`. After a successful merge, it deletes the shard output JSON files and keeps the trial artifacts. An existing `output.json` is overwritten, so use a dedicated output directory for each evaluation.

Keep `output.json` and `artifacts/` together when storing or sharing the results. The combined output is a manifest that points to individual trial result files.

## CLI

Use `agent-eval benchmark plan --help` or `agent-eval experiment plan --help` to see the planning commands. Add `--help` to `plan create`, `plan run`, or `merge` for their options.
