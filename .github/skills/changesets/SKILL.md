---
name: changesets
description: 'Use when changing public APIs or behavior, deprecating usage, recommending replacements, or preparing releases; maintain changesets and versioned migration guides.'
---

# Changesets

For every backwards-incompatible public API or behavior change, deprecation,
or recommended replacement, update the migration docs in the same pull request.
This is required even when no changeset is needed. Keep guides concise: a brief
change description, versioned before/after snippets, and verification steps;
add explicit migration steps only when needed. Read the migration reference
for the index format and release handling.

| Reference                              | When to read                                                                                                 |
| :------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| [Migrations](references/migrations.md) | Documenting breaking changes, deprecations, or replacements, and finalizing migration versions for a release |

Add a changeset when a pull request changes the public API or user-visible
behavior of the published `@primer/agent-eval` package. Public API includes:

- Exported functions, classes, types, constants, and package entry points
- CLI commands, options, output, and exit behavior
- Experiment and scenario configuration accepted from consumers
- Documented runtime behavior that consumers rely on

Do not add a changeset for scenarios, experiments, tests, internal refactors, or
repository tooling that do not affect consumers of `@primer/agent-eval`.

Do not create changesets for updates to features, fixes, or other changes that
have not been released yet.

## Write a changeset

1. Run `pnpm changeset` from the repository root.
2. Select `@primer/agent-eval`.
3. Choose the version bump based on consumer impact:
   - `patch` for a backwards-compatible fix to existing behavior.
   - `minor` for a public API addition, enhancement, or breaking change that
     requires consumers to update their code or configuration.

   Do not use a `major` changeset while `@primer/agent-eval` is pre-1.0.

4. Write a concise summary from the consumer's perspective.

Describe the public API or behavior that was added, changed, fixed, or removed.
For breaking changes, state what consumers need to change. Do not describe
implementation details, internal refactors, file changes, or the development
process unless they directly affect consumers.

Prefer:

> Add support for filtering scenarios by multiple tags.

Avoid:

> Refactor the scenario loader and update its internal filtering helper.
