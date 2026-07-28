---
name: changesets
description: 'Determine whether agent-eval changes need a changeset and write consumer-focused changesets for public API changes.'
---

# Changesets

Add a changeset when a pull request changes the public API or user-visible
behavior of the published `@primer/agent-eval` package. Public API includes:

- Exported functions, classes, types, constants, and package entry points
- CLI commands, options, output, and exit behavior
- Experiment and scenario configuration accepted from consumers
- Documented runtime behavior that consumers rely on

Do not add a changeset for scenarios, experiments, tests, internal refactors, or
repository tooling that do not affect consumers of `@primer/agent-eval`.

## Write a changeset

1. Run `pnpm changeset` from the repository root.
2. Select `@primer/agent-eval`.
3. Choose the version bump based on consumer impact:
   - `patch` for a backwards-compatible fix to existing behavior.
   - `minor` for a backwards-compatible public API addition or enhancement.
   - `major` for a breaking public API change that requires consumers to update
     their code or configuration.
4. Write a concise summary from the consumer's perspective.

Describe the public API or behavior that was added, changed, fixed, or removed.
For breaking changes, state what consumers need to change. Do not describe
implementation details, internal refactors, file changes, or the development
process unless they directly affect consumers.

Prefer:

> Add support for filtering scenarios by multiple tags.

Avoid:

> Refactor the scenario loader and update its internal filtering helper.
