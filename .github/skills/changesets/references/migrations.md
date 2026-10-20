# Maintaining migration guides

Update `packages/agent-eval/docs/migrations/` whenever a change breaks public
usage, deprecates it, or recommends moving to a different API or workflow.
Author concise guides with the implementation, even when no changeset is needed.

## Contents

- [Index](#index)
- [Guides](#guides)
- [Release handling](#release-handling)

## Index

Add a row to `packages/agent-eval/docs/migrations/README.md` with these columns:

- **Version introduced**: the release introducing the change, or `Unreleased`.
- **Entrypoint**: the affected package import path or CLI command.
- **export(s)**: affected exports; use `—` when not applicable.
- **description**: a brief description linking to the migration guide.

## Guides

Create one Markdown file per migration with a stable descriptive filename.
Include only what is needed to perform and verify the migration:

- A brief description of what changed.
- Paired before/after snippets with version labels and realistic imports or
  configuration. Use npm/npx for consumer commands.
- Verification steps using existing project checks or observable outcomes.

Add explicit migration steps or compatibility notes only when the examples
are insufficient. Verify examples against the relevant releases and link
supporting evidence inline rather than adding a separate evidence section.
Check index links and keep current usage docs aligned with the replacement.

## Release handling

Use `Unreleased` for pending versions; replace it in the index and snippets
with the actual version assigned by Changesets when preparing the release.
Preserve released examples and stable guide filenames. Link the guide from the
changeset when one is needed.
