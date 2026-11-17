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
imports:
  - shared/dependency-updater.md
network:
  allowed:
    - defaults
    - node
tools:
  bash:
    - 'corepack:*'
    - 'git:diff'
    - 'node script/get-cooled-npm-release.ts pnpm'
    - 'pnpm:*'
  edit:
steps:
  - name: configure pnpm
    run: |
      mkdir -p "$HOME/.npm-global/bin"
      corepack enable --install-directory "$HOME/.npm-global/bin"
      corepack install
      echo "$HOME/.npm-global/bin" >> "$GITHUB_PATH"
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
2. Run `node script/get-cooled-npm-release.ts pnpm` separately. It returns the stable npm `latest` version only after seven full days have elapsed since publication. Do not use any other version or install an unverified release.
3. If there is no eligible version, or the pin is already at or above it, call `noop` and report why. If the lookup fails, report the failure without updating pnpm.
4. If pnpm is outdated, run `corepack use pnpm@<version>` so `package.json` contains Corepack's canonical version and integrity hash.
5. Run `pnpm install --frozen-lockfile`.
6. Run the repository CI commands:
   - `pnpm run build`
   - `pnpm run format:diff`
   - `pnpm exec turbo run lint`
   - `pnpm exec turbo run lint:npm`
   - `pnpm test --run`
   - `pnpm exec turbo run type-check`
7. Inspect `git diff` and confirm that only `package.json` and, if required by pnpm, `pnpm-lock.yaml` changed. Do not update package dependencies.
8. Create one draft pull request as the final action. Use the title `update pnpm to <version>`. In the body, include:
   - The old and new pnpm versions.
   - A note that the version came from the stable `latest` distribution tag and passed the seven-day cooldown.
   - The validation commands and their results.

Run each required command once. Continue through the remaining validation commands if one fails, and report the failure in the pull request. Do not use subagents, retry denied commands, investigate unrelated failures, modify files to establish a baseline, or create temporary files in the repository.

Never edit generated agentic workflow lockfiles or any other files under `.github/workflows`.
