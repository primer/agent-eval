# Contributing

## Prerequisites

Before contributing, ensure you have these tools installed:

- [Node.js](https://nodejs.org/en/download/) – Use the version specified in
  [.nvmrc](../.nvmrc).
  - On macOS, we recommend using [mise](https://mise.jdx.dev/) to manage
    Node versions.
- [Corepack](https://www.npmjs.com/package/corepack) to manage package managers like `pnpm` for this project.
- [Git](https://github.com/git-guides/install-git)

## Getting started

Before making a contribution, check to see if an issue already exists for the feature or bug you want to work on. If not, create a new issue to discuss your idea. Feel free to make a Pull Request along with the issue, no need to wait for approval before starting work. We welcome contributions from everyone, regardless of experience level.

The code for `@primer/agent-eval` lives in `packages/agent-eval`. You can set up
the project by cloning it and running `script/setup`. There are some other tasks
that may be helpful for you in the course of development:

| Command                     | Description                              |
| :-------------------------- | :--------------------------------------- |
| `pnpm turbo run build`      | Run the build task across all workspaces |
| `pnpm turbo run lint`       | Run the lint task for the project        |
| `pnpm turbo run test`       | Run the tests for the project            |
| `pnpm turbo run type-check` | Run TypeScript across all workspaces     |

You can all tasks available with `turbo` in [`turbo.json`](../turbo.json). You
can optionally filter these tasks with `--filter` to target a specific
workspace.
