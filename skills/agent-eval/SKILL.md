---
name: agent-eval
description: 'Use when installing or using @primer/agent-eval, designing agent evaluations, creating benchmarks, experiments, scenarios, checks, judges, or treatments, and running, planning, sharding, or interpreting evaluations with the agent-eval CLI.'
---

# agent-eval

Use agent-eval to measure how agents perform on real tasks and whether a change
to their environment improves the result.

## Start here

1. Read [the overview](references/overview.md) for the project structure and
   evaluation methodology.
2. For a first evaluation, follow [getting started](references/getting-started.md).
   It includes installation, a complete scenario, and both run configurations.
3. Choose a **benchmark** for a capability baseline or an **experiment** to
   compare treatments. Start with one scenario, one model/effort, and one
   treatment beyond the automatic control.
4. Validate the grader, inspect a saved plan, then run into a fresh output
   directory. Report observed outcomes and limitations, not just completion.

Keep the prompt and fixture treatment-blind. Put the knowledge being tested in
the treatment, and keep evaluation files out of the implementation agent's
workspace using `files`. Separate task failures from evaluation errors.

## Read only the references needed

| Topic                                               | Reference                                              |
| :-------------------------------------------------- | :----------------------------------------------------- |
| Purpose, methodology, project layout                | [Overview](references/overview.md)                     |
| Installation and first run                          | [Getting started](references/getting-started.md)       |
| Stable capability baselines                         | [Benchmarks](references/benchmarks.md)                 |
| Grouping tasks within a benchmark                   | [Capabilities](references/capabilities.md)             |
| Comparing interventions                             | [Experiments](references/experiments.md)               |
| Prompts, fixtures, discovery                        | [Scenarios](references/scenarios.md)                   |
| Control, instructions, skills, agents, MCP, plugins | [Treatments](references/treatments.md)                 |
| Model variants and execution backends               | [Models and runners](references/models-and-runners.md) |
| Deterministic outcomes and measurements             | [Checks](references/checks.md)                         |
| Model-based evaluation and rubrics                  | [Judges](references/judges.md)                         |
| Container lifecycle and setup APIs                  | [Sandbox](references/sandbox.md)                       |
| Saved execution matrices and sharding               | [Plans](references/plans.md)                           |
| Execution, sessions, artifacts, interpretation      | [Trials and results](references/trials-and-results.md) |
| Commands, flags, troubleshooting                    | [CLI](references/cli.md)                               |

These references describe the source API at authoring time. For an installed
version, verify its package types and `npx agent-eval <command> --help`
before using an unfamiliar option. Do not substitute legacy CLI flags.
