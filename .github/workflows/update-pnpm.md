---
name: update-pnpm
description: Keep the project's pnpm package manager version up to date
on:
  schedule: weekly
  workflow_dispatch:
permissions:
  contents: read
  copilot-requests: write
engine: copilot
network:
  allowed:
    - defaults
    - node
tools:
  bash:
    - 'corepack:*'
    - 'git:diff'
    - 'git:status'
    - 'npm:view'
    - 'pnpm:*'
  edit:
safe-outputs:
  create-pull-request:
    title-prefix: 'chore: '
    labels:
      - dependencies
    draft: true
    fallback-as-issue: false
    if-no-changes: ignore
    protected-files: allowed
    allowed-files:
      - package.json
      - pnpm-lock.yaml
  noop:
timeout-minutes: 30
---

# Update pnpm

Keep the stable pnpm version used by this project up to date.

## Required process

1. Read the current pnpm version from `packageManager` in `package.json`.
2. Query the latest stable version with `npm view pnpm@latest version`. Only use the version returned by the `latest` npm distribution tag. Do not select a prerelease version.
3. If the current pin matches the latest stable version, call `noop` as the final action and report that pnpm is current.
4. If pnpm is outdated, run `corepack use pnpm@<version>` so `package.json` contains Corepack's canonical version and integrity hash.
5. Run `pnpm install --frozen-lockfile`.
6. Run the repository CI commands:
   - `pnpm run build`
   - `pnpm run format:diff`
   - `pnpm run lint`
   - `pnpm test --run`
   - `pnpm run type-check`
7. Inspect `git diff` and confirm that only `package.json` and, if required by pnpm, `pnpm-lock.yaml` changed. Do not update package dependencies.
8. Create one draft pull request as the final action. Use the title `update pnpm to <version>`. In the body, include:
   - The old and new pnpm versions.
   - A note that the version came from the stable `latest` distribution tag.
   - The validation commands and their results.

Never edit generated agentic workflow lockfiles or any other files under `.github/workflows`.
