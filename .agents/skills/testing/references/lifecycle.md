# Lifecycle test examples

## Table of Contents

- [Lifecycle and ownership](#lifecycle-and-ownership), L:10
- [Controlled concurrent work](#controlled-concurrent-work), L:22
- [Explicit command failures](#explicit-command-failures), L:51
- [Shared adapter contracts](#shared-adapter-contracts), L:65

## Lifecycle and ownership

Use `trial/run.test.ts` for the borrowed-sandbox contract: reject a setup or task
operation, assert that checks and artifact saving do not run, and verify that
`runTrial` leaves disposal to its caller. Use `await using` in the test's owning
scope so an assertion failure still disposes the sandbox.

At an owning boundary, test cleanup after success and rejection, including partial
acquisition if promised. If retries change, record observable attempt effects to
show what repeats and whether each acquired resource is released. Do not freeze
an incidental call sequence or introduce a seam just to count private steps.

## Controlled concurrent work

For a concurrency contract, gate actual work and observe its admission rather
than sleeping. For example, with two trial tasks sharing a queue of capacity one:

```ts
const started = Promise.withResolvers<void>()
const release = Promise.withResolvers<void>()
const secondQueued = Promise.withResolvers<void>()
queue.on('add', () => {
  if (queue.size === 1) {
    secondQueued.resolve()
  }
})
```

Have the first task's external boundary resolve `started` and await
`release.promise`. Start the second trial after `await started.promise`, then
await `secondQueued.promise` and assert its task has not started. Release the
first task, await both results, and assert both ran. Observe task commands, not
capture commands that may use the same queue.

Put release and settlement in `finally`: resolve the gate and await
`Promise.allSettled` for all started operations even if an assertion fails.
Attach rejection handlers when starting operations so a failure cannot become an
unhandled rejection while waiting on another signal. Use the runner's bounded
test timeout for a missing signal, not arbitrary delays. For changed failure
behavior, also prove that rejection releases capacity for the next item.

## Explicit command failures

`VirtualSandbox.runCommand` always succeeds without executing anything. Override
only the command boundary the test needs, with a typed spy or a small fake:

- For a normal command failure, reject with the adapter's error. Assert that the
  caller propagates it or applies its documented recovery, not a fabricated
  successful result with empty output.
- For `allowNonZeroExitCode: true`, return `{exitCode: 1, stdout: '', stderr:
'capture failed'}` and assert the caller's handling. `runTrial` tolerates a
  nonzero walkthrough command while preserving check results.
- Reject unexpected commands if a fake models command execution. An in-memory
  test does not prove the installed command or real process works.

## Shared adapter contracts

Use a small parameterized test when adapters promise the same observable
behavior. `trial/run.test.ts` runs both `copilot-cli` and `copilot-sdk` through
`runTrial` to protect task/check separation and task failure propagation.
Assert the common result or error; keep command arguments and wire formats in
adapter-specific tests.

For sandbox adapters, share only supported filesystem semantics. Do not run a
command-execution contract against `VirtualSandbox` or make its no-op behavior
the expected system behavior. A system adapter test with a fake Docker transport
checks that adapter's translation, not Docker itself. See
[integration tests](isolation.md#integration-tests) for real-boundary coverage.
