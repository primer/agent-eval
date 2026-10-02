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

## Reusable presets

Import rubric examples from `@primer/agent-eval` and use them in `judges`:

| Export                     | Criteria                                                                       |
| :------------------------- | :----------------------------------------------------------------------------- |
| `visualFidelityJudge`      | Rendered layout, spacing, typography, color, and hierarchy against a reference |
| `interactionClarityJudge`  | Labels, actions, state feedback, and recovery                                  |
| `accessibilityJudge`       | Semantics, names, keyboard use, focus, and announcements                       |
| `codeMaintainabilityJudge` | Readability, responsibilities, reuse, and project conventions                  |
| `testQualityJudge`         | Meaningful assertions, relevant cases, and deterministic isolation             |

```ts
import {codeMaintainabilityJudge, testQualityJudge} from '@primer/agent-eval'
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add project search and tests for matching, no matches, and clearing the query.',
  judges: [
    {
      ...codeMaintainabilityJudge,
      instructions: `${codeMaintainabilityJudge.instructions}\nEvaluate only the project search implementation.`,
    },
    testQualityJudge,
  ],
})
```

Spread presets to override `name`, `instructions`, `files`, `model`, or `scores`;
do not mutate shared exports. Append scenario-specific scope and requirements.
Use unique names when reusing a preset. Models are not pinned by default.

Presets use scores `0`, `1`, and `2` with criterion-specific anchors. A `0` can
mean missing evidence rather than poor work: inspect the rationale. Calibrate
these examples against human-reviewed results before relying on the numbers;
they are not validated metrics or interchangeable dimensions.

For visual fidelity, provide a scenario-contained reference in `files` and
arrange comparable implementation screenshots in a check before judges run.
Do not put generated screenshots in `files`, or mistake a reference for
implementation evidence. The automatic walkthrough happens too late.

Choose only relevant judges to limit cost. Pair accessibility review with
automated and manual tests; it is not conformance certification. Test quality
reviews implementation tests, not private grader tests, and does not replace
running the tests.

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
