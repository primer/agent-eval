# Testing philosophy

## Contents

- [Test contracts](#test-contracts)
- [Choose cases](#choose-cases)
- [Choose boundaries](#choose-boundaries)

## Test contracts

- Exercise the public interface of the unit: a function, module, or package.
  A module's exported interface can be tested without being a package export.
- Assert observable results, errors, and state changes, not private methods or
  internal call sequences.
- Prefer `parse*` entry points over reaching into their schemas.
- Do not export private helpers only to test them.
- A refactor that preserves behavior should not require rewriting expectations.
- Do not recreate the implementation to calculate the expected result.

## Choose cases

- Start with a representative successful use of the API.
- Test omitted options and their defaults, then explicit overrides.
- Distinguish omitted, empty, `undefined`, `null`, `false`, and zero only where
  the contract treats them differently.
- Cover meaningful boundaries: empty and multiple items, limits, invalid input,
  and failure paths.
- For paths, cover relative and absolute inputs, missing files, and containment
  rules where applicable.
- For async work, cover cancellation, failures, and cleanup when promised.
- Add a regression test that fails for the bug and passes for the fix.
- Avoid exhaustive combinations, repeated coverage, and tests of third-party
  behavior we do not own.

## Choose boundaries

- Default to fast, deterministic tests of real logic with
  [in-memory dependencies](isolation.md#existing-dependencies).
- Test collaborating modules together when their interaction is the contract;
  do not mock every layer to make a test a "unit test."
- Reserve [integration tests](isolation.md#integration-tests) for behavior that
  needs the real filesystem, Docker, a process, or a service.
- Keep a few package or CLI boundary tests for wiring; do not repeat every case
  at every layer.
- Use coverage to find gaps, not as a substitute for useful assertions. Follow
  the [authoring guidance](authoring.md#assertions) to make failures actionable.
