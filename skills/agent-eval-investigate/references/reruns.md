# Focused reruns

## Critical

Do not edit setup or launch an evaluation without the user's approval. Preserve
the baseline and use a fresh output directory for every run. Isolate one agreed
intervention, keep grading and unrelated setup fixed, and never leak grading
answers into instructions. Ask before another change or paid rerun.

## Table of contents

- [Agree on scope](#agree-on-scope)
- [Preserve the comparison](#preserve-the-comparison)
- [Plan and execute](#plan-and-execute)
- [Compare and iterate](#compare-and-iterate)

## Agree on scope

Ask: "Would you like me to apply the proposed setup change and rerun a focused
comparison?" State the change, trial scope, repetitions, and expected resource
or credit usage if known. Do not promise a cost from missing usage data.

## Preserve the comparison

If approved, preserve the baseline bundle and configuration/resource revisions.
For an experiment, apply only the agreed intervention in a separate treatment,
retaining the old treatment for comparison. Benchmarks have only `Control` and
`Benchmark` treatments: compare unchanged and modified benchmark setups in separate
runs, or use an experiment to compare old/new treatments together.

Put the intervention in experiment treatment setup or benchmark top-level `setup`,
not shared scenario setup or benchmark capability setup, so control stays
uncontaminated.

## Plan and execute

1. Verify installed `npx agent-eval --help` and the relevant subcommand help.
   Create and inspect an `experiment plan create` or `benchmark plan create` plan
   before its corresponding `plan run`. Keep the scenario, model, effort, runner,
   grading, and unrelated setup fixed; do not invent model or repetition flags.
2. Confirm Docker and authorized authentication are available. Use
   `COPILOT_GITHUB_TOKEN` rather than exposing a token in command arguments.
   Run into a fresh output directory, never over the baseline.

## Compare and iterate

Compare the targeted behavior, checks/judges, regressions, errors, and usage.
Verify actual tool use in the new messages rather than relying on installation
or aggregate scores. Repeat close comparisons in separate output directories.

Report whether the hypothesis was supported, contradicted, or remains
inconclusive. Ask before another change or paid rerun; stop when the user's goal
is met, the agreed budget is reached, or evidence no longer supports further
iteration. A single improved trial is not proof of general improvement.
