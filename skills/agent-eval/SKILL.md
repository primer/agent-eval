---
name: agent-eval
description: 'Use when installing or using @primer/agent-eval, designing agent evaluations, creating benchmarks, experiments, scenarios, checks, judges, or treatments, and running, planning, sharding, or interpreting evaluations with the agent-eval CLI.'
---

# agent-eval

Read `node_modules/@primer/agent-eval/docs/AGENTS.md` in the evaluation project,
then load only the references needed for the task. The installed package docs
are the source of truth for its version; do not use docs from a different version.

If the package is not installed, install it with
`npm install --save-dev @primer/agent-eval` (or the project's package manager).
If an older package does not include docs, ask the user before upgrading it;
otherwise use that version's README, package types, and
`npx agent-eval <command> --help` without assuming newer APIs are available.

To load these docs without installing this skill, run `npx agent-eval setup`
from the project's root. It adds guidance to the project's agent instructions.
