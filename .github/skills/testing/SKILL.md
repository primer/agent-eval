---
name: testing
description: 'Use when adding, updating, or reviewing tests in agent-eval, choosing test coverage, organizing Vitest tests, or isolating filesystem, Docker, and other external dependencies.'
---

# Testing

Write tests that protect behavior our callers rely on, without depending on
implementation details or external services.

## Contents

- [Workflow](#workflow)
- [Philosophy](references/philosophy.md): what to test and where to draw boundaries
- [Authoring](references/authoring.md): file organization, `test`, `expect`, and running tests
- [Isolation](references/isolation.md): in-memory dependencies, injection, and integration tests

## Workflow

- First ask [is this worth testing?](references/philosophy.md#is-this-worth-testing).
  Identify a meaningful contract and a plausible regression before adding tests.
- Read the relevant references; existing tests are examples, not rules to copy.
- Use real logic with in-memory dependencies wherever possible.
- Run the focused tests and confirm they fail when the intended behavior breaks.

This skill covers repository tests. For grading agent-generated work in a
scenario, use the [checks reference](../../../skills/agent-eval/references/checks.md).
