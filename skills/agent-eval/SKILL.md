---
name: agent-eval
description: 'Use when installing or using @primer/agent-eval, designing agent evaluations, creating benchmarks, experiments, scenarios, checks, judges, or treatments, and running, planning, sharding, or interpreting evaluations with the agent-eval CLI.'
---

# agent-eval

Use agent-eval to measure how agents perform on real tasks and whether a change
to their environment improves the result.

## Choose a task

Read only the references needed for the current task. The overview is context,
not a prerequisite for every operation.

| Task                                                    | Read                                                                               |
| :------------------------------------------------------ | :--------------------------------------------------------------------------------- |
| Install and complete a first evaluation                 | [Getting started](references/getting-started.md)                                   |
| Understand project structure and evaluation methodology | [Overview](references/overview.md)                                                 |
| Establish a capability baseline                         | [Benchmarks](references/benchmarks.md), [capabilities](references/capabilities.md) |
| Compare instructions, skills, agents, MCP, or plugins   | [Experiments](references/experiments.md), [treatments](references/treatments.md)   |
| Create a task, starting workspace, or custom image      | [Scenarios](references/scenarios.md)                                               |
| Add deterministic grading or a subjective rubric        | [Checks](references/checks.md) or [judges](references/judges.md)                   |
| Select models, effort, or execution backends            | [Models and runners](references/models-and-runners.md)                             |
| Install resources or run commands in a trial            | [Sandbox](references/sandbox.md)                                                   |
| Inspect a run matrix, shard, or merge                   | [Plans](references/plans.md)                                                       |
| Read results or diagnose agent behavior                 | [Trials and results](references/trials-and-results.md)                             |
| Find a command, flag, or runtime failure                | [CLI](references/cli.md)                                                           |

## Execution rules

- For a first comparison, use one scenario, one model/effort, and one treatment
  beyond the automatic control.
- Keep prompts and fixtures treatment-blind. Put the knowledge being tested in
  treatment setup, not shared setup.
- Withhold grader files using `files`. Verify the starter fails for the intended
  reasons and a correct solution passes; restore the starter before execution.
- Inspect the plan's combinations before running. Use a fresh output directory.
- Use `--progress` on run commands for trial counts instead of informational logs.
- Finish by reading trial results and reporting outcomes and errors separately.
  Command completion alone does not establish quality.

These references describe the source API at authoring time. For an installed
version, verify its package types and `npx agent-eval <command> --help`
before using an unfamiliar option. Do not substitute legacy CLI flags.
