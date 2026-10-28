---
name: agent-eval
description: 'Use when installing or using @primer/agent-eval, defining evaluation targets, creating benchmarks, experiments, scenarios, checks, judges, or treatments, and running, planning, sharding, or interpreting evaluations. Do not use for repository unit tests unrelated to scenario grading.'
---

# agent-eval

Read `node_modules/@primer/agent-eval/docs/AGENTS.md` in the evaluation project,
then load only the references needed for the task. The installed package docs
are the source of truth for its version; do not use docs from a different version.
For scenario design, select the scenarios and checks references to define the
target behavior and choose direct hooks or grading tools; load judges only when
the target needs semantic judgment.

If the package is not installed, install it with
`npm install --save-dev @primer/agent-eval` (or the project's package manager).
If an older package does not include docs, ask the user before upgrading it;
otherwise use that version's README, package types, and
`npx agent-eval <command> --help` without assuming newer APIs are available.

To load these docs without installing this skill, run
`npx agent-eval agent setup` from the project's root. It adds guidance to the
project's agent instructions.
