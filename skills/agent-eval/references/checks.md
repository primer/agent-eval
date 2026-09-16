# Checks

Checks deterministically evaluate the completed workspace. Use them for runtime
tests, linting, builds, source conventions that cannot be verified at runtime,
or numeric measurements. A check lives in a scenario's `checks` array.

A check has `name`, optional `description`, optional `files`, and
`async run({sandbox, logger})`. `files` are private evaluation inputs restored
before that check. Keep assertions in test files and have `run` invoke the
tool, then translate its output into evaluation results.

## Return shapes

Return a group of outcomes:

```ts
return {
  outcomes: [
    {type: 'outcome', id: 'filters-by-name', status: 'passed'},
    {type: 'outcome', id: 'empty-state', status: 'failed'},
    {type: 'outcome', id: 'optional-case', status: 'skipped'},
  ],
}
```

Or return a measurement group:

```ts
return {
  id: 'bundle-size',
  unit: 'bytes',
  direction: 'lower-is-better',
  measurements: [{type: 'measurement', value: 1024}],
}
```

These values illustrate the shape; derive real values from observed evidence.
Measurements may specify `higher-is-better` or `lower-is-better`. Omit direction
when neither is inherently preferable.

To return several groups, return an array with a unique `id` on each group.
Each group contains **either** outcomes **or** measurements, not both.
Individual outcomes may have IDs; individual measurements contain only their
type and value. Either collection can contain `{type: 'error', message: '...'}`.
Do not add the internal group discriminant `type: 'outcomes'` or
`type: 'measurements'` to authored return values; the library normalizes them.

## Vitest pattern

Use `scenario.test.ts`, a dedicated `vitest.config.scenario.ts` with a JSON
reporter, and `files` listing both plus any private helpers. See the complete
working pattern in [getting started](getting-started.md).

Run Vitest with `allowNonZeroExitCode: true`: assertion failures commonly exit
with `1`, and you still need the report. Reject unexpected exit codes, missing
or invalid reports, zero tests, and a nonzero exit without failed assertions
as evaluation errors. Do not convert them into empty outcomes or a passing
result.

Return one outcome per assertion, using its full test name as the ID.
This preserves attribution when one part of a task fails. Use runtime behavior
instead of broad source-string matches when possible.

## Validate the grader

Check the untouched fixture fails intentionally and a correct implementation
passes. Check alternative valid implementations too. A missing feature should
not cause all unrelated tests to fail during module import; use dynamic lookup
or independent assertions where needed.

For browser behavior, explicitly configure browser tests and their dependencies.
A saved screenshot or walkthrough is not an automated behavioral assertion.
Do not use an expensive judge to enforce a rule a reliable deterministic check
can already measure.

Use `logger` for relevant diagnostics and throw when the check cannot execute.
Keep "the implementation failed a requirement" distinct from "the evaluator
could not determine the result".
