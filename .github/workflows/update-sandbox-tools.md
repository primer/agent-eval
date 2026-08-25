---
name: update-sandbox-tools
description: Keep the sandbox npm and GitHub Copilot CLI versions up to date
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
    - 'npm:view:*'
    - 'pnpm:*'
  edit:
steps:
  - name: configure pnpm
    run: |
      mkdir -p "$HOME/.npm-global/bin"
      corepack enable --install-directory "$HOME/.npm-global/bin"
safe-outputs:
  create-pull-request:
    title-prefix: 'chore: '
    labels:
      - dependencies
    draft: true
    fallback-as-issue: false
    if-no-changes: ignore
    allowed-files:
      - packages/agent-eval/src/sandbox.ts
  noop:
timeout-minutes: 30
---

# Update sandbox tools

Keep the stable versions of npm and GitHub Copilot CLI used by evaluation sandboxes up to date.

## Version sources and pins

| Tool               | Latest stable version                     | Current pin                                                   |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| npm                | `npm view npm@latest version`             | `NPM_VERSION` in `packages/agent-eval/src/sandbox.ts`         |
| GitHub Copilot CLI | `npm view @github/copilot@latest version` | `COPILOT_CLI_VERSION` in `packages/agent-eval/src/sandbox.ts` |

## Required process

1. Read both current pins before making changes.
2. Query both version sources. Only use the versions returned by the `latest` npm distribution tag. Do not select prerelease versions.
3. If both current pins match their latest stable versions, call `noop` as the final action and report that both tools are current.
4. For each outdated tool:
   - Update only its documented pin.
5. Run `pnpm install --frozen-lockfile`.
6. Run the repository CI commands:
   - `pnpm run build`
   - `pnpm run format:diff`
   - `pnpm exec turbo run lint`
   - `pnpm exec turbo run lint:npm`
   - `pnpm test --run`
   - `pnpm exec turbo run type-check`
7. Inspect `git diff` and confirm that only the allowed files changed. Do not make unrelated dependency updates.
8. Create one draft pull request as the final action. Use the title `update sandbox tool versions`. In the body:
   - List every tool checked with its old and new version.
   - Clearly mark tools that were already current.
   - Include the validation commands and their results.

Run each required command once. Continue through the remaining validation commands if one fails, and report the failure in the pull request. Do not use subagents, retry denied commands, investigate unrelated failures, modify files to establish a baseline, or create temporary files in the repository.

Never edit generated agentic workflow lockfiles or any other files under `.github/workflows`.
