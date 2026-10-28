# agent-eval

Use agent-eval to measure how agents perform on real tasks and whether a change
to their environment improves the result.

## Choose a task

Read only the references needed for the current task. The overview is context,
not a prerequisite for every operation.

| Task                                                        | Read                                                                                                            |
| :---------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| Install, set up instructions, and run a first evaluation    | [Getting started](references/getting-started.md)                                                                |
| Understand project structure and evaluation methodology     | [Overview](references/overview.md)                                                                              |
| Establish a capability baseline                             | [Benchmarks](references/benchmarks.md), [capabilities](references/capabilities.md)                              |
| Compare instructions, skills, agents, MCP, or plugins       | [Experiments](references/experiments.md), [treatments](references/treatments.md)                                |
| Create a task, starting workspace, or custom image          | [Scenarios](references/scenarios.md)                                                                            |
| Add deterministic grading or a subjective rubric            | [Checks](references/checks.md) or [judges](references/judges.md)                                                |
| Select models, effort, or execution backends                | [Models and runners](references/models-and-runners.md)                                                          |
| Install resources, search files, or run commands in a trial | [Sandbox](references/sandbox.md)                                                                                |
| Inspect a run matrix, shard, or merge                       | [Plans](references/plans.md)                                                                                    |
| Read results or diagnose agent behavior                     | [Trials and results](references/trials-and-results.md), [experiment reports](references/experiments.md#reports) |
| Start the unstable, feature-flagged UI or find CLI help     | [CLI](references/cli.md)                                                                                        |
| Enable or disable unstable features                         | [Feature flags](references/feature-flags.md)                                                                    |
| Upgrade existing APIs, configuration, or workflows          | [Migrations](migrations/README.md)                                                                              |

For an evidence-driven investigation of why a model behaved a certain way, use
the `agent-eval-investigate` skill (installed separately with
`npx skills add primer/agent-eval --skill agent-eval-investigate`). It proposes
setup improvements and offers focused reruns only with the user's approval.

## Execution rules

- When a decision or recommendation relies on a resource, include the specific
  evidence and explain how it supports the conclusion. Cite file paths and line
  numbers, or link to the relevant external section or comment and quote the
  supporting passage. Read the resource first and distinguish evidence from
  inference.
- For a first comparison, use one scenario, one model/effort, and one treatment
  beyond the automatic control.
- Keep prompts and fixtures treatment-blind. Put the knowledge being tested in
  treatment setup, not shared setup.
- Define the precise behavior being evaluated before choosing checks. Separate
  that target from incidental fixture work. Prefer deterministic checks for
  observable events; use judges only for criteria needing semantic judgment.
  Skill invocation alone does not establish offer quality or consent handling.
- Keep simple reads, parsing, filtering, and event checks directly in
  `checks[].run` using sandbox APIs. Use `sandbox.runCommand` only for execution
  inside the sandbox, not to spawn Node for file processing. Vitest and
  `createVitestCheck` are optional; see [Checks](references/checks.md).
- Withhold grader-owned files using `files` when needed. Verify only the changed
  criterion with relevant positive and negative evidence; for implementation
  checks, confirm intended starter failures and a correct solution, then restore
  the starter. Do not add a parallel harness or test unrelated fixture behavior.
- Treat evidence capture as infrastructure, not an agent-behavior score. Inspect
  available events directly and assert the target signal, not transcript capture.
- Inspect the plan's combinations before running. Use a fresh output directory.
- Finish by reading trial results and reporting outcomes and errors separately.
  Command completion alone does not establish quality.
- Interpret session AI credits using [Trials and results](references/trials-and-results.md);
  missing usage is not the same as zero cost.

These docs ship with `@primer/agent-eval` and describe that package version.
Verify its package types and `npx agent-eval <command> --help` before using an
unfamiliar option. Do not substitute legacy CLI flags.
