---
name: update-sandbox-tools
description: Keep the sandbox GitHub Copilot CLI and Copilot SDK versions up to date
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
    - 'git:diff'
    - 'node script/get-cooled-npm-release.ts @github/copilot'
    - 'node script/get-cooled-npm-release.ts @github/copilot-sdk'
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
      - packages/agent-eval/src/sandbox/images/tools.ts
      - .changeset/*.md
  noop:
timeout-minutes: 30
---

# Update sandbox tools

Keep the stable versions of GitHub Copilot CLI and Copilot SDK used by evaluation sandboxes up to date.

npm is supplied by the base Node.js image and has no separate version pin. Do not add an npm pin or update the base image in this workflow.

## Version sources and pins

| Tool               | Eligible stable version                                     | Current pin                                                                |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| GitHub Copilot CLI | `node script/get-cooled-npm-release.ts @github/copilot`     | `COPILOT_CLI_VERSION` in `packages/agent-eval/src/sandbox/images/tools.ts` |
| GitHub Copilot SDK | `node script/get-cooled-npm-release.ts @github/copilot-sdk` | `COPILOT_SDK_VERSION` in `packages/agent-eval/src/sandbox/images/tools.ts` |

## Required process

1. Read both current pins before making changes.
2. Run both commands in the table separately. Each returns the stable npm `latest` version only after seven full days have elapsed since publication. Do not use any other versions or install unverified releases. If either lookup fails, report the failure without updating the pins.
3. If neither tool has an eligible version newer than its pin, call `noop` and report why.
4. For each tool with an eligible version newer than its pin, update only its documented pin.
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
   - Clearly mark tools that were already current or waiting for their cooldown.
   - Include the validation commands and their results.

Run each required command once. Continue through the remaining validation commands if one fails, and report the failure in the pull request. Do not use subagents, retry denied commands, investigate unrelated failures, modify files to establish a baseline, or create temporary files in the repository.

Never edit generated agentic workflow lockfiles or any other files under `.github/workflows`.
