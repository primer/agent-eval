# Checks

## Table of Contents

- [Contract](#contract), L:19
- [Direct hooks](#direct-hooks), L:36
- [Return fragments](#return-fragments), L:81
- [Annotations](#annotations), L:120
- [Run](#run), L:161
- [Vitest](#vitest), L:167
- [ESLint](#eslint), L:208
- [Verify](#verify), L:235
- [Pitfalls](#pitfalls), L:248

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

Choose checks only after defining the precise target behavior. Prefer
deterministic checks for directly observable events, including tool or skill
invocations. State what each outcome proves: a skill invocation does not prove
the quality of an offer or consent handling. Use a judge only for a criterion
that genuinely requires semantic judgment.

## Direct hooks

`checks[].run` is ordinary TypeScript. Keep simple file reads, parsing,
filtering, and event checks directly in the hook using `sandbox.readFile`,
`sandbox.glob`, and other sandbox APIs. Do not spawn Node merely to read or
process a file. Use `sandbox.runCommand` only when actual execution inside the
sandbox is needed, such as a build, CLI, or test runner.

For example, this check grades a task whose target is writing `stable` to
`release-channel.txt`. It needs no test file or test framework:

```ts
{
  name: 'release-channel',
  async run({sandbox}) {
    let channel = ''
    if (await sandbox.exists('release-channel.txt')) {
      channel = await sandbox.readFile('release-channel.txt')
    }

    return {
      outcomes: [
        {
          type: 'outcome',
          id: 'stable-channel',
          status: channel.trim() === 'stable' ? 'passed' : 'failed',
        },
      ],
    }
  },
}
```

For event checks, inspect the relevant implementation-session events using
their documented format for the selected runner/version. Filter for the target
invocation, not a transcript mention, installation, or unrelated session.
Do not assume event paths or formats are portable across runners.

Evidence capture is infrastructure, not an agent-behavior score. Assert the real
target signal rather than emitting an always-passing "transcript captured"
outcome. Avoid intermediate artifacts when the hook can inspect events directly.
Throw when evaluation cannot execute; do not substitute passing or empty
results. An unreadable event log is an evaluation error, while a readable log
without the required event is a failed outcome.

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
Omitted annotations are parsed as an empty array, including when reading older
results. An explicit empty array is also accepted.

Each annotation is self-contained. A UI can render one item per annotation
with its own message, context, location, and snippet. Keep details describing
the same diagnostic together in one annotation. Multiple annotations describe
separate diagnostics, not fragments to combine by array position.

## Run

Direct hook logic and inline checks are valid. Vitest and `createVitestCheck`
are optional; do not add test files, browser infrastructure, or dependencies
just because a helper exists.

### Vitest

When using Vitest, `createVitestCheck` from `@primer/agent-eval/scenario` is a
convenience for running tests and translating their results:

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
The helper enables test location collection. Each reported failure message
becomes a self-contained annotation with the assertion's full name as `context`.
When there are no failure messages, the outcome includes one annotation using
the assertion's full name as `message`. Each annotation uses the suite's file
name as `location.path` and includes the test's line and column when reported.
These locations identify the test declaration, not necessarily the failing
statement.
Pass an optional `files` array for additional private files or directories, such
as test helpers, setup files, or fixtures. These are withheld from the agent and
copied in before the check runs alongside the config and tests, but are not used
as Vitest test filters. Omitting `files` adds no extra paths.

For custom Vitest integrations, run Vitest with `allowNonZeroExitCode: true`: assertion failures commonly exit
with `1`, and you still need the report. Reject unexpected exit codes, missing
or invalid reports, zero tests, and a nonzero exit without failed assertions
as evaluation errors. Do not convert them into empty outcomes or a passing
result.

For Vitest results, return one outcome per assertion, using its full test name as the ID.
This preserves attribution when one part of a task fails. Use runtime behavior
instead of broad source-string matches when possible.

### ESLint

Use `createESLintCheck` from `@primer/agent-eval/scenario` for lint grading:

```ts
createESLintCheck({
  name: 'eslint',
  configPath: 'eslint.config.scenario.js',
  lintPaths: ['src', 'lib/**/*.ts'],
  files: ['helpers/lint-rules.js'],
})
```

Install ESLint and any config plugins in the scenario. Use paths relative to its
directory and provide at least one lint target. The helper withholds the config
and optional additional `files` from the agent, but leaves lint targets visible.
It runs `npx eslint` with the supplied config, a JSON formatter, and
`--max-warnings 0`. Each reported file has one outcome with its file path as the
ID: no errors or warnings passes; either fails, including syntax errors.
Each lint diagnostic becomes an annotation with its message, its rule ID as
`context` when available, and a `location` containing the file path and any
reported line and column. Files without diagnostics have an empty annotations
array.
Unexpected exits, missing or malformed reports, no reported files, and
inconsistent exit codes throw evaluation errors. Temporary reports are removed
after the check, including on failure.

## Verify

- Scope verification to the changed criterion and relevant positive and negative
  evidence. For event checks, the target event passes and absent or unrelated
  events fail; for implementation checks, the untouched fixture fails for the
  intended reason and a correct solution passes, including plausible alternatives.
- Reuse existing infrastructure. Do not build a parallel validation harness or
  test unrelated fixture behavior.
- Each target signal has an attributable outcome. When using a test runner,
  an unrelated missing export must not prevent independent checks from running.
- When using reports or test runners, missing or malformed reports, zero tests,
  and unexpected exits surface as evaluation errors, not agent failures.

## Pitfalls

Use dynamic lookup or independent assertions when a missing feature would
otherwise cause a suite-wide module import failure.

When browser behavior is itself the target, configure browser tests and their dependencies.
A saved screenshot or walkthrough is not an automated behavioral assertion.
Do not use an expensive judge to enforce a rule a reliable deterministic check
can already measure.

Use `logger` for relevant diagnostics and throw when the check cannot execute.
Keep "the implementation failed a requirement" distinct from "the evaluator
could not determine the result".
