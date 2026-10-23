# Trials and results

**Use when:** reading a completed evaluation, diagnosing failures, or comparing
treatments. Each trial has its own ID, sandbox, execution, and evidence.

## Contract

| Item                        | Rule                                                                            |
| :-------------------------- | :------------------------------------------------------------------------------ |
| Trial identity              | Scenario, treatment, model variant, runner; also capability for benchmarks      |
| Benchmark/experiment output | `output.json` manifest with `trials` mapping IDs to relative file paths         |
| Trial result location       | `artifacts/<trial-id>/<trial-id>.json`                                          |
| Scenario output             | `{id, results}`, with embedded results rather than a trial-file manifest        |
| Quality evidence            | Check outcomes/measurements and judge results, not command exit alone           |
| Trial status                | `type: 'success'` with evaluation fields, or `type: 'error'` with error details |

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

Image builds, sandbox creation, trial stages, and sandbox cleanup retry up to
three times (four attempts total). Each retry creates a fresh sandbox after
building the scenario image. Exhausted failures are recorded per trial so other
trials can finish. Failed assertions are check outcomes, not trial errors.

## Read a result bundle

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
benchmark and benchmark-backed experiment output also include capability metadata.

Resolve each trial file path relative to the output directory. Trial files
include model, runner, treatment/scenario identifiers, and a `type` discriminator.
For `type: 'success'`, they also include checks, judges, agent sessions,
walkthrough information, and artifact locations. For `type: 'error'`, they
include `error: {name, message, stack?}` and no evaluation or artifact fields.
Narrow by `type` before reading success-only fields. Historical trial files
without `type` parse as successes. Preserve the whole
bundle when sharing or archiving. Embedded artifact paths can be absolute;
do not assume every metadata path relocates automatically.

Benchmark-backed experiment trials include `capabilityId`. The package root
exposes `parseExperimentTrialOutput(json, capabilities)` to check membership
against the bundle's capability map. Scenario-only and legacy experiment
bundles default to an empty capability map; missing historical membership is
not inferred.

Standalone `scenario run` writes a different output: `{id, results}`, with
entries containing `trial: {id, model, runner, scenarioId, treatmentId}` and an
embedded `result`. Do not parse it as a benchmark/experiment manifest.
Embedded scenario results also use `type: 'success'` or `type: 'error'`.

The package root exposes schemas including `BenchmarkOutputFileSchema`,
`BenchmarkTrialOutputSchema`, `ExperimentOutputFileSchema`, and
`ExperimentTrialOutputSchema`, plus discovery and reporting helpers. Use these
public exports rather than assuming all result shapes are interchangeable.

## Agent sessions

Sessions record messages, turns, output tokens, premium requests, AI credits, API duration,
session duration, and tool call counts. Judge outputs have their own sessions.
Use session evidence to establish whether a skill or tool was actually used,
not simply installed.

`aiCredits` is optional: older sessions and responses without usage totals omit
it rather than reporting zero. When available, it is the latest session-wide
`totalNanoAiu` from usage checkpoints or shutdown, divided by 1,000,000,000.
These totals already include subagents; do not sum cumulative checkpoints or
add subagent totals again. Premium requests remain a separate metric.

Trial summaries aggregate `aiCredits` across sessions and reports compare the
total with control alongside other usage metrics. The summary total is `null`,
reported as `N/A`, when no session recorded usage totals.

Any trial execution error marks the selected evaluation incomplete. CLI reports
show `Status: Incomplete` and trial errors instead of aggregate scores, rankings,
or usage deltas. Website summaries show the incomplete status, and historical
trends exclude that evaluation. Successful trial details remain available for
diagnosis, but are not aggregated into partial comparisons.

Failed check assertions in a completed trial remain valid outcomes and do not
make the evaluation incomplete.

Implementation-session usage is not automatically a full evaluation bill:
judges, walkthrough capture, setup, and container execution also have costs.
Keep usage units explicit and do not translate them into money without a
verified pricing basis.

## Verify

- Confirm the result IDs and dimensions match the planned trial selection.
- Resolve every trial file; inspect error details for failures and checks, judge
  findings, and artifact paths for successes.
- Distinguish failed assertions, skipped assertions, evaluator errors, and
  unavailable walkthroughs. Do not aggregate them as equivalent failures.
- Support causal explanations with saved workspace and session evidence.

Compare like-for-like scenario/model/effort/runner groups across treatments.
For benchmark-backed experiments, CLI reports include capability totals under
each treatment. Compare scenario/model groups within the same capability;
shared scenarios are reported separately for each capability.
Look at granular regressions before an aggregate score. Explain failures using
saved source and sessions rather than speculating from a summary.

## Pitfalls

The CLI completing successfully does not establish agent quality or complete
coverage. For close comparisons, repeat with separate output directories.
Record what changed, what remained fixed, and the evidence supporting the conclusion.
Call a promising result "best observed" rather than universally better.
