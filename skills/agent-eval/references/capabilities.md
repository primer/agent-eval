# Capabilities

**Use when:** grouping benchmark scenarios under a behavior such as navigation,
forms, or API migration. Experiments select scenarios directly, without
capability groups.

## Contract

| Item                | Rule                                                       |
| :------------------ | :--------------------------------------------------------- |
| Location            | An entry in a benchmark's `capabilities` array             |
| Required fields     | `name`, `scenarios`                                        |
| Optional field      | `setup`                                                    |
| Identity            | Name-derived ID; names must be unique within the benchmark |
| Scenario references | Folder names under the selected scenarios directory        |
| Setup scope         | Both `Control` and `Benchmark`, before treatment setup     |

Put only shared prerequisites in capability setup. Install the resource being
measured in the benchmark's top-level setup.

## Configuration fragment

Insert this property inside a benchmark configuration after creating the
`001-labels` fixture from [getting started](getting-started.md):

```ts
capabilities: [
  {
    name: 'Data transformation',
    scenarios: ['001-labels'],
  },
]
```

Add `async setup({sandbox})` to an entry only when it needs shared setup.
Prefer pinned dependencies in the fixture manifest when no setup hook is needed.

## Run and verify

Create and run the enclosing [benchmark](benchmarks.md), not the capability
itself. Inspect its plan for the expected capability/scenario memberships and
both treatment conditions.

Group related tasks without making one scenario cover every behavior. Keep
granular scenario checks so the capability summary does not hide failures.

## Pitfalls

Renaming a capability changes its ID and can invalidate saved plans. A scenario
listed under two capabilities runs twice per model/treatment combination.
Oversized capabilities can dominate aggregate results; inspect their scenarios
individually.
