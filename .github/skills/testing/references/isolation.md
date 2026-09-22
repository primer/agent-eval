# Isolating dependencies

## Contents

- [Existing dependencies](#existing-dependencies)
- [Dependency injection](#dependency-injection)
- [Deterministic tests](#deterministic-tests)
- [Integration tests](#integration-tests)

## Existing dependencies

- Avoid real filesystem access, Docker, network requests, and agent execution
  in ordinary behavior tests.
- Use [`VirtualHost`](../../../../packages/agent-eval/src/host.ts) for an
  in-memory filesystem. Seed only the files the case needs and pass the host
  through the existing API.
- Use [`VirtualSandbox`](../../../../packages/agent-eval/src/sandbox/virtual.ts)
  for supported in-memory sandbox operations. Share the host with
  `VirtualSandbox.create({host})` when needed.
- Use `await using` for sandbox lifetime management.
- `VirtualSandbox.runCommand` returns an empty successful result; it does not
  execute commands. Resource-installation methods are no-ops. Neither proves
  that a command or installation works.
- `VirtualHost.loadModule` uses data URLs. Do not assume it reproduces disk-based
  module resolution or provides a fresh module instance on every call.
- See the [parser example](authoring.md#example) for basic host injection.

## Dependency injection

- Keep the behavior under test real; replace only the external boundary.
- Reuse existing `Host`, `Sandbox`, or callback parameters before adding a seam.
- When a seam is missing, separate pure decisions from I/O or inject the smallest
  typed capability needed. Avoid test-only flags and broad new abstractions.
- Prefer a small in-memory implementation over `vi.mock` or patching globals.
- Make fakes honor the relevant contract, including failures. Do not return
  success for an unsupported operation the test depends on.
- Use a stub or spy only when a fake adds no value, such as supplying a command
  failure or recording an externally meaningful request.
- Assert externally visible outcomes where possible. Check arguments or ordering
  only when those interactions are the behavior being protected.

## Deterministic tests

- Create a fresh host, sandbox, and fake state for each test.
- Use fixed inputs for clocks, IDs, and randomness when their values matter.
- Use controlled promises or fake timers instead of sleeping or relying on
  machine speed.
- Restore timers, spies, and environment changes in cleanup hooks or `finally`.
- Do not depend on test order, a developer's files, credentials, or running
  services.

## Integration tests

- Use real dependencies only when testing their adapter or wiring requires it,
  not as incidental setup for [logic tests](philosophy.md#choose-boundaries).
- Keep these tests explicitly selected and document their prerequisites.
  Do not silently pass when Docker or another dependency is unavailable.
- For filesystem integration, use a unique temporary directory and remove only
  that directory in guaranteed cleanup.
- For Docker or process integration, bound execution time and clean up only
  resources the test created, including after failures.
- Do not claim an in-memory fake verifies OS, Docker, or external-service
  behavior. Cover those differences at the real boundary.
