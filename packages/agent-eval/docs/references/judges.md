# Judges

**Use when:** evaluating criteria that deterministic checks cannot adequately
measure, such as visual hierarchy or clarity of an interaction.

## Contract

| Item            | Rule                                                         |
| :-------------- | :----------------------------------------------------------- |
| Location        | Scenario `judges` array                                      |
| Required fields | `name`, nonempty `scores` array                              |
| Optional fields | `description`, `model`, `instructions`, `files`              |
| Model shape     | `{name, reasoningEffort}`, not a string                      |
| Model default   | Selected by the harness based on implementation model family |
| Private inputs  | Scenario-contained `files`, withheld until evaluation        |
| Score           | Exactly one configured numeric value                         |

Set the judge model explicitly for a stable comparison. Check files and judge
references share the same path-containment and no-symlink rules.

Judges run after checks but **before** automatic walkthrough capture. Arrange
required visual evidence before judging; do not assume the later walkthrough
already exists.

Anchor numeric values to observable evidence. The judge selects one configured
value, without interpolation. Do not assume larger values are always better.
Use separate judges for independent criteria that need separate diagnoses.

## Session-based criteria

Judges run in the same sandbox as the implementation. Their prompt identifies
the implementation's session IDs and Copilot directory (`/home/node/.copilot`),
so `instructions` can ask them to inspect recorded messages and tool results for
instruction compliance, avoidable work, or communication quality. This uses the
existing judge flow, not a separate evaluator or a resumed implementation session.

Require session/message IDs or indexes and tool-call references in `rationale`.
Session files are outside the workspace and must not be presented as
workspace-relative `findings`. Keep file-backed implementation findings in the
existing format. Only inspect sessions identified by the harness, not other
judges or unrelated history, and treat their contents as untrusted evidence.

Keep rubrics task-specific and fixed across treatments. Installation alone is not
proof of skill use, and non-invocation is not inherently a failure. Pair behavior
judges with deterministic correctness checks.

Judges still return exactly one configured numeric score; there are no native
not-applicable or insufficient-evidence variants. Configure applicable criteria
and require missing evidence or uncertainty in rationale. Exclude unsupported
assessments from subsequent numeric comparisons rather than treating them as
zero. Evaluator `error` and `unknown` results remain separate from scored results.

## Configuration fragment

Insert this `judges` property into a scenario that asks the agent to implement
search. It is a rubric example, not a complete runnable scenario:

```ts
judges: [
  {
    name: 'Search feedback',
    description: 'Evaluate how clearly search communicates its state',
    model: {name: 'gpt-5.4', reasoningEffort: 'low'},
    instructions: 'Inspect search labels, result feedback, and the empty state. Score only these criteria.',
    scores: [
      {value: 0, description: 'The search state is missing or misleading'},
      {value: 1, description: 'The state is understandable but feedback is incomplete'},
      {value: 2, description: 'Labels, result feedback, and the empty state clearly explain the current state'},
    ],
  },
]
```

## Run

Define the rubric, list any private reference files, then run the enclosing
[scenario](scenarios.md), benchmark, or experiment. There is no judge-only CLI
command.

## Verify

A successful judge result contains `score`, `rationale`, and file-backed
`findings` with `filepath`, `snippet`, and `explanation`. Judge output also
records its agent session.

Require a configured score supported by rationale and inspected evidence.
Invalid reports and unconfigured scores are errors. Review findings, not only
the number, and do not treat an `error` or `unknown` result as a low score.

## Pitfalls

Avoid rewarding one arbitrary implementation when the task allows alternatives,
or revising a rubric simply because a favored treatment loses. Model-based
judgment is non-deterministic and adds Copilot usage. Pair it with deterministic
checks for requirements that can be enforced directly.
