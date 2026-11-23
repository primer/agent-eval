# Dependency and lifecycle map

## Table of Contents

- [Current boundaries](#current-boundaries), L:10
- [Results, failures, and artifacts](#results-failures-and-artifacts), L:29
- [Intended direction](#intended-direction), L:52
- [Executable checks and advisory review](#executable-checks-and-advisory-review), L:63

## Current boundaries

The working dependency map is **planning -> execution -> adapters**, not a claim
that these are already isolated layers.

| Area                         | Current responsibility and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Planning                     | `experiment/plan.ts:26` (`createExperimentPlan`) and `benchmark/plan.ts:26` (`createBenchmarkPlan`) expand configurations into trials. `plan.ts:28-76` randomizes new plans, preserves manifest order, and selects trials.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Execution                    | `plan.ts:122-226` (`runPlan`) creates container and Copilot semaphores and starts every trial; each attempt holds a container permit. An attempt is one `Effect.scoped` unit: stage a directory (`trial/store.ts:202-239`), build the image, acquire the sandbox with `Effect.acquireRelease`, run the trial, and commit (`trial/store.ts:241-279`). `Effect.retry` repeats the whole attempt up to three times after the initial attempt. With `resume`, committed trials are loaded (`trial/store.ts:146-200`) instead of run. `trial/run.ts:96-139` (`runTrial`) borrows that sandbox for setup, task, checks, judges, capture, and save into the staging directory; Copilot stages take a Copilot permit. |
| Adapters                     | `host.ts:8-64` provides host filesystem, module loading, and sandbox creation. `sandbox/types.ts:107-176` defines sandbox effects; `sandbox/system.ts:54-76` and `sandbox/virtual.ts:17-28` implement the lifecycle. `copilot-cli.ts:438-498` and `copilot-sdk.ts:150-192` execute agents through `Sandbox`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Composition and presentation | `cli/commands/experiment.ts:269-281` wires plans, execution, output, and reports (benchmark and scenario commands have corresponding wiring). `experiment/output.ts:201-263` transforms trial results for consumers; report modules render summaries.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Paths in the table are relative to `packages/agent-eval/src/`.
Read the named operation before relying on this snapshot.
Planning and infrastructure are currently coupled: `plan.ts` also imports
`scenario/scenario.ts`, whose `buildScenarioImage` directly calls Docker and
packs the real filesystem (`scenario/scenario.ts:134-193`). Injecting a
`VirtualHost` does not isolate that path.

## Results, failures, and artifacts

- **Evaluation results** include check outcomes, measurements, structured check
  errors, and judge results (`check.ts`, `judge.ts`). A failed outcome is data,
  not by itself a rejected trial.
- **Execution failures** are rejected operations or typed Effect failures. A
  setup, task, check callback, or save failure stops `runTrial` with a
  `TrialStageError`; `runPlan` retries the whole attempt, including earlier
  effects. Closing the attempt scope disposes the sandbox and removes the
  trial's staging directory, so a failed attempt publishes nothing. Sandbox
  disposal failure is logged, not retried. Each trial's exit is collected, so a
  failed trial neither interrupts nor cancels siblings; after all trials settle,
  `runPlan` fails with `PlanRunError` listing failed trial IDs.
- **Committed artifacts** are published by renaming the staging directory to
  `artifacts/<trial-id>/` after writing the `.agent-eval-trial.json` commit
  record. A trial directory without that record is uncommitted; resume rejects
  a record whose trial identity differs.
- **Presentation artifacts** include walkthrough media, workspace downloads,
  and rendered reports. In `trial/run.ts`, capture command nonzero exit is
  tolerated and absent media becomes `Unavailable`. Capture installation and
  saving artifacts can still reject execution. Do not describe all artifact
  failures as best-effort or interpret absent media as a failed evaluation.

## Intended direction

For an affected change, keep trial selection and evaluation decisions independent
of infrastructure details where an existing seam permits it. Keep lifecycle
ownership explicit at the orchestration boundary and adapter-specific operations
at the adapter boundary. This is a direction for local changes, not a requirement
to reorganize existing modules or extract a new layer.

Do not change retry scope, cleanup guarantees, cancellation, or artifact failure
policy as an incidental refactor. State and test any intentional behavior change.

## Executable checks and advisory review

`.github/workflows/ci.yml` already runs
`pnpm exec turbo run test -- --run`. Colocated tests enforce concrete contracts;
do not add source-text checks or dependency rules for the intended map above.

For optional review, request Copilot on the pull request with repository custom
instructions enabled. `.github/instructions/lifecycle-review.instructions.md`
scopes advice to library changes; it does not enable automatic review or change
merge requirements. Findings need a changed location, existing contract evidence,
and an observable consequence, not an architecture score.
