# Checks

**Use when:** verifying deterministic behavior, builds, lint rules, source
conventions that runtime tests cannot establish, or numeric measurements.
Use a [judge](judges.md) only for criteria that need model-based judgment.

## Contract

| Item            | Rule                                                         |
| :-------------- | :----------------------------------------------------------- |
| Location        | Scenario `checks` array                                      |
| Required fields | `name`, `async run({sandbox, logger})`                       |
| Optional fields | `description`, `files`                                       |
| Private inputs  | List tests, runner configs, and helpers in `files`           |
| Return          | One group, or an array of groups with an `id` on every group |
| Group contents  | Either `outcomes` or `measurements`, never both              |

Keep assertions in test files. Have `run` invoke the tool and translate observed
results into outcomes or measurements. Throw when evaluation cannot execute;
do not substitute passing or empty results.

## Return fragments

The following fragments illustrate return shapes inside `run`, not complete
checks. Derive actual values from evidence; do not copy the example verdicts.

An outcome group:

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

Measurements may specify `higher-is-better` or `lower-is-better`. Omit direction
when neither is inherently preferable.

To return several groups, return an array with a unique `id` on each group.
Each group contains **either** outcomes **or** measurements, not both.
Individual outcomes may have IDs; individual measurements contain their type
and value. Either collection can contain `{type: 'error', message: '...'}`.
Outcomes, measurements, and errors all support annotations.
Do not add the internal group discriminant `type: 'outcomes'` or
`type: 'measurements'` to authored return values; the library normalizes them.

### Annotations

Individual outcomes, measurements, and errors may include an optional
`annotations` array. Each annotation has a required `message` string, optional
`context` and `snippet` strings, and an optional `location`:

```ts
{
  type: 'outcome',
  status: 'failed',
  annotations: [
    {
      context: 'Search filters projects by name',
      message: 'Expected one matching project, received three',
      snippet: 'expect(filteredProjects).toHaveLength(1)',
      location: {
        path: 'scenario.test.ts',
        line: 12,
        column: 3,
      },
    },
  ],
}
```

Use `message` for a test name or details explaining the result, `context` for
supporting text, and `snippet` for relevant source text. Use `location` for a
file reference: it requires a nonempty `path` string and accepts optional
`line` and `column` values as 1-based positive integers. Paths may be relative
or absolute and are preserved as provided. They are not checked, resolved, or
copied, so references to files that no longer exist are accepted.
Annotations are preserved in saved benchmark and experiment trial results.
Context remains free-form descriptive metadata.
Omitting annotations leaves the field absent; an empty array is also accepted.

Each annotation is self-contained. A UI can render one item per annotation
with its own message, context, location, and snippet. Keep details describing
the same diagnostic together in one annotation. Multiple annotations describe
separate diagnostics, not fragments to combine by array position.

## Run

Use `createVitestCheck` from `@primer/agent-eval/scenario` for Vitest grading:

```ts
createVitestCheck({
  name: 'tests',
  configPath: 'vitest.config.scenario.ts',
  testPaths: ['scenario.test.ts'],
  files: ['helpers/setup.ts', 'fixtures'],
})
```

Install Vitest in the scenario and use paths relative to its directory. The
helper lists the config and tests in `files`, invokes `npx vitest run` with the
supplied config and test filters, and selects its own JSON reporter. It returns
one outcome per assertion using its full name as the ID, maps pending/todo/skipped
to skipped, and rejects unusable reports. See [getting started](getting-started.md).
Each outcome also includes one annotation with the assertion's full name as
`message` and its suite's file name as `context` when reported by Vitest.
Pass an optional `files` array for additional private files or directories, such
as test helpers, setup files, or fixtures. These are withheld from the agent and
copied in before the check runs alongside the config and tests, but are not used
as Vitest test filters. Omitting `files` adds no extra paths.

For custom checks, run Vitest with `allowNonZeroExitCode: true`: assertion failures commonly exit
with `1`, and you still need the report. Reject unexpected exit codes, missing
or invalid reports, zero tests, and a nonzero exit without failed assertions
as evaluation errors. Do not convert them into empty outcomes or a passing
result.

Return one outcome per assertion, using its full test name as the ID.
This preserves attribution when one part of a task fails. Use runtime behavior
instead of broad source-string matches when possible.

## Verify

- The untouched fixture fails the intended assertions, rather than failing to
  start the test runner.
- A correct implementation passes, including plausible alternatives.
- Each assertion has an attributable outcome; an unrelated missing export does
  not prevent independent checks from running.
- Missing or malformed reports, zero tests, and unexpected exits surface as
  evaluation errors.

## Pitfalls

Use dynamic lookup or independent assertions when a missing feature would
otherwise cause a suite-wide module import failure.

For browser behavior, explicitly configure browser tests and their dependencies.
A saved screenshot or walkthrough is not an automated behavioral assertion.
Do not use an expensive judge to enforce a rule a reliable deterministic check
can already measure.

Use `logger` for relevant diagnostics and throw when the check cannot execute.
Keep "the implementation failed a requirement" distinct from "the evaluator
could not determine the result".
