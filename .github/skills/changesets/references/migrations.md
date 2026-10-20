# Maintaining migration guides

Update `packages/agent-eval/docs/migrations/` whenever a change breaks public
usage, deprecates it, or recommends moving to a different API or workflow.
Author the guide with the implementation, not as a follow-up release task.
This is agent-maintained documentation, not generated from changeset summaries.

## Contents

- [When to update](#when-to-update)
- [Guide contract](#guide-contract)
- [Release handling](#release-handling)
- [Verification](#verification)

## When to update

Include exported APIs and types, package entry points, CLI usage, configuration,
runtime requirements, and persisted result formats. Cover behavior changes even
when the API signature is unchanged. Deprecations need guidance when introduced,
not only when the old API is removed.

Skip internal refactors, compatible additions, and fixes that preserve documented
usage. Changes confined to unreleased features do not need a changeset, but still
update any existing migration guidance made inaccurate by the change.

## Guide contract

Create one Markdown file per migration with a stable descriptive filename and
add a row to `packages/agent-eval/docs/migrations/README.md`. Keep multiple
migrations for a release separate when they address independent tasks.

Each guide must include:

- Source version or verified affected version range, and target version. Use
  `Unreleased` when the target has not shipped; never predict a release number.
- Status: breaking change, deprecation, or recommended replacement. Record
  deprecation and removal versions separately; say when removal is unscheduled.
- Scope: affected imports, symbols, signatures, CLI flags, configuration keys,
  runtime behavior, or output fields. State who needs to act and who does not.
- A concise mapping from old usage to new usage, including any behavior changes.
- Paired, fenced before/after examples with the same intent and realistic
  imports, configuration, and surrounding context. Label each with its version;
  use npm/npx for consumer commands. Do not present pseudocode as runnable code.
- Ordered migration steps, edge cases, compatibility limits, and manual decisions
  an agent cannot safely infer. If there is no replacement, say so.
- Verification commands or observable outcomes that establish migration success.
- Evidence: link the release changelog, implementation, tests, or PR that
  establishes the version boundary and behavior. Verify old examples against
  the source release and new ones against the target implementation.

Use the existing experiment-discovery guide as a structural example. Do not
invent historical signatures, version ranges, or deprecation dates.

## Release handling

Keep an `Unreleased` row and guide for pending migrations, linking the associated
changeset when one exists. When preparing a release, resolve those entries to
the actual package version assigned by Changesets and update the index,
before/after labels, and evidence links together. Do not rename stable guide
files or rewrite previously released examples to match newer APIs.

A changeset summarizes impact; the migration guide supplies the actionable
replacement. Link the guide from the changeset for changes that need both.

## Verification

Check that the guide is linked from the migration index, all relative links
resolve, and examples demonstrate the stated source-to-target transition.
Exercise new examples using existing tests or CLI commands when practical;
otherwise record what was checked and what remains unverified.

Keep historical instructions explicitly versioned, and current usage guides
aligned with the current API. Do not add migration guides for unrelated changes.
