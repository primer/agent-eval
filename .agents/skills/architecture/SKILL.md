---
name: architecture
description: 'Use when changing orchestration, lifecycle, retry or cleanup behavior, resource ownership, or dependency boundaries in agent-eval. Do not use for isolated parsing, formatting, documentation, or UI changes that leave these boundaries unchanged.'
---

# Architecture

Start with the behavior being changed, not a framework or a preferred layering.

- Identify the observable contract: who calls this operation, what result or
  error they receive, and which behavior must remain unchanged.
- Trace external effects: commands, filesystem writes, containers, agent calls,
  and published artifacts. Read the affected callers and adapters.
- Name the owner of each resource, when ownership starts, and who cleans up on
  success, partial initialization, failure, or cancellation (if supported).
- Make the failure policy explicit: which failures are evaluation data, which
  reject execution, and which presentation failures are tolerated. Identify the
  retry scope and effects it may repeat, including cleanup.
- Choose the smallest useful seam. Reuse `Host`, `Sandbox`, and existing
  callbacks; separate a decision from I/O only when that clarifies a real
  contract. Avoid speculative frameworks, lifecycle engines, generic retry
  layers, or interfaces for hypothetical adapters.
- Load the testing skill when adding or changing tests. Protect the affected
  contract with focused cases rather than assertions about private structure.

Instructions explain intent; tests enforce behavior. CI runs executable
contracts, while Copilot code review provides optional, evidence-backed advice.
Neither review automation nor the dependency map introduces new policy.

## References

| Name                                                     | When to use                                                                                                                      |
| :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| [Dependency and lifecycle map](references/boundaries.md) | Locate current planning, execution, and adapter responsibilities; distinguish existing behavior from the direction for a change. |
