# Skill-revision comparison

Keep the task and grading treatment-blind. Install the tested skill only in its
treatment. Ask for approval before edits or paid runs; preserve existing results.

## Contents

- [Prepare the task](#prepare-the-task)
- [Configure treatments](#configure-treatments)
- [Assess behavior with judges](#assess-behavior-with-judges)
- [Execute and compare](#execute-and-compare)

## Prepare the task

Read the installed package's scenarios, checks, experiments, treatments, judges,
and results references before writing configuration.

Start with one representative scenario, model/effort, and runner. Use a realistic
starter workspace and deterministic checks for correctness. Withhold grader files,
verify intended starter failures and a correct solution, then restore the starter.

When discovery is the hypothesis, do not name the skill or disclose its contents
in the prompt. Add negative-trigger and held-out tasks after the initial wiring
comparison, within the approved budget.

## Configure treatments

Create an experiment using `defineConfig` from `@primer/agent-eval/experiment`,
with the same scenario for both configured treatments:

| Treatment           | Resources                                                 |
| :------------------ | :-------------------------------------------------------- |
| Automatic `Control` | Neutral fixture and shared prerequisites; no tested skill |
| `Current skill`     | Pinned current skill and supporting files                 |
| `Proposed skill`    | Pinned proposed skill and supporting files                |

Use `sandbox.addAgentSkill(name, description, contents, {files})` inside each
treatment's `setup`. Supply the body as `contents`; the method creates frontmatter.
Copy every required reference or script. See the installed treatments reference
for inline files and `{sourcePath, destinationPath}` entries.

Preserve the skill's original name and description unless changing one is the
intervention. Record a commit or content digest covering the complete resource,
not only `SKILL.md`. Resolve host resource paths deliberately.

Do not install the skill in experiment shared setup or the fixture. Keep runtime
tools and unrelated instructions identical. Retain the current treatment when
adding a proposal; do not overwrite its files or rewrite an existing plan.

## Assess behavior with judges

Use existing scenario judges, not another evaluator API. Set the judge model
explicitly and keep its instructions and score anchors fixed across treatments.
The judge prompt identifies implementation session IDs and the Copilot directory.
Ask the judge to inspect relevant recorded messages and tool results and cite
session/message/tool-call references in its rationale. Never resume the session.

Use separate judges for independent criteria. Adapt these optional rubric
templates to the task before running:

| Criterion              | 0                                             | 1                                                   | 2                                                               |
| :--------------------- | :-------------------------------------------- | :-------------------------------------------------- | :-------------------------------------------------------------- |
| Instruction compliance | Omits an applicable required procedure        | Partially follows it, with a consequential omission | Follows the applicable procedure with recorded evidence         |
| Avoidable work         | Repeats failed actions without using feedback | Some unnecessary work, but adapts to feedback       | Uses evidence to make progress without observed redundant loops |
| Communication quality  | Misleading claims or missing required handoff | Accurate but incomplete or needlessly repetitive    | Accurate, sufficient, task-appropriate handoff                  |

Do not reward short transcripts that omit necessary work. Assess compliance
against the instructions actually available in that treatment; control must not
fail merely for lacking the tested skill.

Current judges require exactly one configured numeric score. They do not have
native abstention or not-applicable result variants. Only configure criteria that
apply to the task. Require uncertainty and missing evidence in rationale; exclude
unsupported assessments from the diagnostic report's numeric comparisons.
Keep evaluator `error` and `unknown` results separate from low scores.

## Execute and compare

Verify Docker, authorized authentication, and installed CLI help. For an experiment
saved as `experiments/skill-revision.ts`, create the plan:

```sh
npx agent-eval experiment plan create skill-revision --output-path ./skill-revision-plan.json
```

Inspect combinations and resources before the approved run:

```sh
npx agent-eval experiment plan run --plan-path ./skill-revision-plan.json --output-dir ./results/skill-revision-01
```

One scenario/model/effort/runner with two configured treatments produces three
trials including control. Do not invent a repetitions option; repeat in separate
output directories.

Read the manifest and individual trial files. Compare correctness first, then
behavior, regressions, and usage within matching groups. Inspect actual skill use
in sessions, not just installation. Judge activity is not implementation activity.
Report denominators and missing evidence rather than a curved overall grade.

Classify the proposal as supported, contradicted, or inconclusive on these tasks.
A promising result is best observed, not universally better. Ask before further
changes or runs; stop at the agreed budget or when evidence no longer supports
iteration.
