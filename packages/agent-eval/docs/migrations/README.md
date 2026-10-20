# Migrations

Use these guides to move existing agent-eval code, configuration, or workflows
between versions. Each guide records the old API, its replacement, and paired
examples that an agent can use to make a targeted migration.

## Guides

| Source version | Target version | Change          | Guide                                                                             |
| :------------- | :------------- | :-------------- | :-------------------------------------------------------------------------------- |
| 0.12.x         | 0.13.0         | Breaking change | [Supply a benchmarks directory when loading experiments](experiment-discovery.md) |

This index is not a complete history of breaking changes before this section
was introduced. Consult the package changelog for releases not covered here.
`Unreleased` entries, when present, describe pending changes, not published APIs.

## Applying a migration

1. Identify your installed version and intended target version:

   ```sh
   npm ls @primer/agent-eval
   ```

2. Read guides whose version boundaries fall between those versions, in release
   order. Check each guide's scope before editing; not every project is affected.
3. Apply the before/after mappings only to the relevant imports, calls, or data.
   Follow any manual decisions and compatibility notes rather than blindly
   replacing text.
4. Run the guide's verification steps and your project's existing checks.

These docs ship with the package. For an upgrade, consult the target release's
docs, since your older installed copy cannot describe later changes. Historical
examples describe their labeled version, not necessarily the current API.
