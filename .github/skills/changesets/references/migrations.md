# Maintaining migration guides

Update `packages/agent-eval/docs/migrations/` whenever a change breaks public
usage, deprecates it, or recommends moving to a different API or workflow.
Author concise guides with the implementation, even when no changeset is needed.

## Contents

- [Index](#index)
- [Guides](#guides)
- [Release handling](#release-handling)

## Index

Prepend new rows to `packages/agent-eval/docs/migrations/README.md`, keeping
versions ordered newest first. Use these columns:

- **Version introduced**: the release introducing the change; use the next minor
  version for pending changes while the package is pre-1.0.
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

While the package is pre-1.0, use the next minor version from
`packages/agent-eval/package.json` in the index and snippets for pending changes
(for example, `0.16.0` → `0.17.0`). Revisit this policy at 1.0 when the semver
policy changes.
Preserve released examples and stable guide filenames. Link the guide from the
changeset when one is needed.
