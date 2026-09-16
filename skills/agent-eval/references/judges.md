# Judges

Judges use a model to inspect the completed workspace against an explicit
rubric. Use them for criteria that deterministic checks cannot adequately
measure, such as visual hierarchy or clarity of an interaction.

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

A judge requires `name` and a nonempty `scores` array. `description`, `model`,
`instructions`, and `files` are optional. The model is a variant object with
singular `reasoningEffort`, not a model string. Without an explicit model, the
harness selects a default judge model based on the implementation model family.
Set one explicitly when you need a stable comparison.

Judge `files` are private rubric/reference inputs inside the scenario directory.
They are withheld during implementation and copied in for the judge. The same
path containment and no-symlink rules as [checks](checks.md) apply.

## Rubric design

Anchor each numeric value to observable evidence. The judge must choose exactly
one configured value; it cannot interpolate or invent a scale. Do not assume
all scales have the same meaning or that larger numbers are always better.

Separate independent criteria into separate judges when their failures need
different diagnoses. Avoid rewarding one arbitrary implementation if the task
allows alternatives. Do not revise the rubric simply because a favored
treatment loses.

Judges run after checks, but before automatic walkthrough capture. If visual
evidence is required, arrange for it to be available during judging rather than
assuming the later walkthrough already exists. Be explicit about evidence and
runtime inspection requirements.

## Results and limitations

A successful judge result contains `score`, `rationale`, and file-backed
`findings` with `filepath`, `snippet`, and `explanation`. Judge output also
records its agent session. Invalid reports and unconfigured scores are errors,
not ordinary low scores; results may also be `unknown`.

Inspect findings and evidence, not only the number. Model-based judgment is
non-deterministic and adds Copilot usage. Pair it with deterministic checks for
requirements that can be enforced directly.
