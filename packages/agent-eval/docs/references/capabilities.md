# Capabilities

**Use when:** grouping benchmark scenarios under a behavior such as navigation,
forms, or API migration. Benchmark-backed experiments reuse the benchmark's
capability groups; scenario-backed experiments select scenarios directly.

## Contract

| Item                | Rule                                                       |
| :------------------ | :--------------------------------------------------------- |
| Location            | An entry in a benchmark's `capabilities` array             |
| Required fields     | `name`, `scenarios`                                        |
| Optional field      | `setup`                                                    |
| Identity            | Name-derived ID; names must be unique within the benchmark |
| Scenario references | Folder names under the selected scenarios directory        |
| Setup scope         | Every treatment in the capability, before treatment setup  |

Put only shared prerequisites in capability setup. Install the resource being
measured in the benchmark's top-level setup, which runs only for `Benchmark`.
In benchmark-backed experiments, capability setup also applies to custom
treatments, after experiment setup and before treatment setup.

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

Create and run the enclosing [benchmark](benchmarks.md) or a benchmark-backed
[experiment](experiments.md), not the capability itself. Inspect its plan for
the expected capability/scenario memberships and all treatment conditions.

Group related tasks without making one scenario cover every behavior. Keep
granular scenario checks so the capability summary does not hide failures.

## Pitfalls

Renaming a capability changes its ID and can invalidate saved plans. A scenario
listed under two capabilities runs twice per model/treatment combination.
Oversized capabilities can dominate aggregate results; inspect their scenarios
individually.
