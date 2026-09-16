# Trials and results

A trial is one scenario, treatment, model variant, and implementation runner.
Benchmark trials also belong to a capability. It has its own ID, sandbox, agent
execution, evaluation, and artifacts.

## Lifecycle

1. Copy the fixture, withhold evaluation files, and install its dependencies.
2. Run shared setup, treatment setup, and the fixture's build if present.
3. Run the implementation agent with the scenario prompt.
4. Restore check files and execute checks.
5. Run judges against their rubrics.
6. Attempt visual walkthrough capture, then save artifacts.

The pre-task build does not verify the agent's finished implementation.
Configure a check for that. The walkthrough is additional review evidence, not
a replacement for checks or judges. Capture is attempted even for non-UI
projects and can be unavailable.

## Result bundles

Benchmark and experiment output directories contain:

```text
output.json
artifacts/
  <trial-id>/
    <trial-id>.json
    ...saved workspace, configuration, and walkthrough files
```

`output.json` is a manifest. Its `trials` object maps IDs to relative trial JSON
paths, not embedded trial results. It includes scenario and treatment metadata;
benchmark output also includes capability metadata.

Resolve each trial file path relative to the output directory. Trial files
include model, runner, treatment/scenario identifiers, checks, judges, agent
sessions, walkthrough information, and artifact locations. Preserve the whole
bundle when sharing or archiving. Embedded artifact paths can be absolute;
do not assume every metadata path relocates automatically.

Standalone `scenario run` writes a different output: `{id, results}`, with
entries containing `trial: {id}` and an embedded `result`. Do not parse it as a
benchmark/experiment manifest.

The package root exposes schemas including `BenchmarkOutputFileSchema`,
`BenchmarkTrialOutputSchema`, `ExperimentOutputFileSchema`, and
`ExperimentTrialOutputSchema`, plus discovery and reporting helpers. Use these
public exports rather than assuming all result shapes are interchangeable.

## Agent sessions

Sessions record messages, turns, output tokens, premium requests, API duration,
session duration, and tool call counts. Judge outputs have their own sessions.
Use session evidence to establish whether a skill or tool was actually used,
not simply installed.

Implementation-session usage is not automatically a full evaluation bill:
judges, walkthrough capture, setup, and container execution also have costs.
Keep usage units explicit and do not translate them into money without a
verified pricing basis.

## Interpretation

Inspect each check's outcomes or measurements and each judge's result,
rationale, and findings. The CLI completing successfully does not mean the
agent met every requirement. A `failed` assertion, an evaluator `error`, a
`skipped` assertion, and an unavailable walkthrough have different meanings.

Compare like-for-like scenario/model/effort/runner groups across treatments.
Look at granular regressions before an aggregate score. Explain failures using
saved source and sessions rather than speculating from a summary.

For close comparisons, repeat with separate output directories. Record what
changed, what remained fixed, and the evidence supporting the conclusion.
Call a promising result "best observed" rather than universally better.
