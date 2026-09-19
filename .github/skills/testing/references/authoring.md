# Authoring tests

## Contents

- [File organization](#file-organization)
- [Test structure](#test-structure)
- [Assertions](#assertions)
- [Example](#example)
- [Run tests](#run-tests)

## File organization

- Colocate tests with the module: `check.ts` and `check.test.ts`.
- Group tests by exported operation, then behavior: normal inputs, defaults,
  boundaries, and failures.
- Prefer flat `test` cases; use `describe` only when grouping adds context.
- Keep fixtures and helpers local until multiple files need the same setup.
- Share small, typed fixture builders, not a configurable test framework.

## Test structure

- Import `test` and `expect` from `vitest`; use `test`, not `it`.
- Name the operation and expected behavior so a failure is understandable alone.
  Describe the behavior, not incidental fixture values such as filenames.
- Keep setup, action, and assertions in that order, separated by blank lines.
- Test one behavior per case; multiple assertions can describe that behavior.
- Prefer separate, behavior-named tests. Use `test.each` for a meaningful input
  matrix, not just to reduce repeated setup. Give each case a descriptive name
  rather than making readers interpret raw inputs in the title.
- Create fresh state per test. Keep relevant setup visible instead of hiding
  it in nested hooks or shared mutable fixtures.
- Await async work and assertions. Dispose resources even when assertions fail.
- Keep helpers type-safe; do not use `as any` or double casts to build fixtures.
  Pass invalid values through `unknown` input boundaries when testing parsing.

## Assertions

- Choose cases from the [contract](philosophy.md#choose-cases), not source lines.
- Use `toBe` for scalar values and `toEqual` or `toStrictEqual` for structures.
- Assert exact results when completeness matters; use `toMatchObject` only when
  the omitted fields are irrelevant to the behavior.
- Prefer specific expectations over truthiness checks or broad snapshots.
- Use `toThrow` for synchronous errors and awaited `rejects.toThrow` for async
  errors. Check the relevant error message or type, not incidental stack traces.
- Assert outcomes rather than spy call counts, unless the interaction itself
  is the contract. See [dependency injection](isolation.md#dependency-injection).
- Use `expectTypeOf` for type contracts and run the type checker too.

## Example

In `packages/agent-eval/src/check.test.ts`, exercise the parser's default through
its exported interface without touching the real filesystem:

```ts
import {expect, test} from 'vitest'
import {parseCheckConfig} from './check'
import {VirtualHost} from './host'

test('parseCheckConfig defaults files to an empty array', async () => {
  const host = VirtualHost.create()
  const input = {
    name: 'example',
    async run() {
      return {outcomes: []}
    },
  }

  const check = await parseCheckConfig(host, '/scenario', input)

  expect(check.files).toEqual([])
})
```

Use the same approach for explicit options and invalid inputs, with each case
protecting a distinct [contract](philosophy.md#test-contracts).

## Run tests

- Run from the repository root:
  `pnpm exec turbo run test -- --run`.
- During development, pass a file path:
  `pnpm exec turbo run test -- --run packages/agent-eval/src/check.test.ts`.
- Add `-t 'defaults files'` after `--run` to select a test by name.
- Confirm the intended cases ran; an empty selection is not validation.
- For a regression, confirm the test fails without the fix for the intended
  reason, then passes with it.
- Run `pnpm exec turbo run type-check` when testing type contracts.
