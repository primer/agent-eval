# Repairing evaluation workflows

Use the **retry evaluation** workflow to recover execution errors in a merged
benchmark or experiment result. It keeps completed trials, trial IDs, and the
original result directory and date.

```sh
gh workflow run retry-evaluation.yml \
  -f type=benchmark \
  -f run-id=123456789
```

Set `type=experiment` for an experiment. The source run must have an unexpired
`benchmark-<run-id>` or `experiment-<run-id>` artifact containing exactly one
merged result bundle. A missing shard or a workflow that stopped before merge
is not a recorded trial error; finish or rerun the failed workflow jobs first.

The workflow downloads that artifact and checks out the original run's source
revision into a separate directory. It runs the current retry tooling against
those evaluation definitions, then uploads a complete repaired bundle under
the new workflow run ID. The checkout keeps prompts, fixtures, setup functions,
and configuration references tied to the original revision; it does not freeze
external packages or resources fetched by setup.

The repaired artifact retains the original source revision for subsequent
repairs. If some trials still fail, use the repair workflow's run ID for the
next attempt so completed recoveries are retained. Do not restart from the
original artifact unless that is intentional.

The benchmark deployment workflow includes repaired benchmark artifacts.
Artifacts are overlaid oldest to newest, so the repaired bundle replaces the
same evaluation date instead of adding another trend point. Experiment
artifacts remain available through Actions, matching the experiment workflow.

For a downloaded bundle, run the CLI directly:

```sh
npx agent-eval benchmark retry --output-dir ./results/benchmarks/design-system/2026-10-23
npx agent-eval experiment retry --output-dir ./results/experiments/comparison/2026-10-23
```

From this checkout, the existing run helpers also accept `retry`:

```sh
RUN_DATE=2026-10-23 script/run-benchmark.sh design-system retry
RUN_DATE=2026-10-23 script/run-experiment.sh comparison retry
```

Retry only after the original workflow finishes. Keep the whole bundle and
use one writer at a time. Retry preserves the manifest and completed trial
files, so successful results downloaded from another worker are not rewritten
using that worker's original absolute artifact paths.
