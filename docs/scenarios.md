# Scenarios

Scenarios are used to evaluate agent performance on a given task. By default, they live in a `scenarios` folder in your project.

Each scenario defines a prompt for the agent, a starting workspace, and checks or judges that evaluate the result. Scenarios are shared by [benchmarks](./benchmarks.md) and [experiments](./experiments.md), which select them by their folder names.

As an example, you may want to evaluate how well an agent adds a search feature to an existing application. The scenario provides the application and a prompt describing the task. Checks can verify that search works, while a judge can evaluate how well the result fits the rest of the application.

## Config

You can add a scenario by creating a folder in `/scenarios` with a `package.json`, the files the agent needs to start the task, and a `scenario.config.ts` file. Use `defineConfig` from `@primer/agent-eval/scenario` to configure the scenario.

```ts
// scenarios/001-agent-scenario/scenario.config.ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add a search feature that filters the list of projects by name.',
  description: 'Evaluate whether the agent can add search to an existing application',
})
```

The scenario's workspace files are copied into a [sandbox](./sandbox.md), where the agent works on the task described by `prompt`. The `description` explains what the scenario evaluates.

Add `checks` for deterministic verification, `judges` for model-based evaluation, or both.

### Checks

Checks are used to deterministically evaluate how well an agent performed on a task. They can run tools like Vitest or ESLint, compare files to a baseline, or collect measurements about the result.

Each check has a name and a `run` function that receives the sandbox. For example, a scenario with Vitest installed and tests in `scenario.test.ts` can report whether its test suite passes:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add a search feature that filters the list of projects by name.',
  description: 'Evaluate whether the agent can add search to an existing application',
  checks: [
    {
      name: 'tests',
      description: 'Verify that the search behavior passes the tests',
      files: ['vitest.config.scenario.ts', 'scenario.test.ts'],
      async run({sandbox}) {
        const result = await sandbox.runCommand('npx', ['vitest', 'run', '--config', 'vitest.config.scenario.ts'], {
          allowNonZeroExitCode: true,
        })

        return {
          outcomes: [
            {
              type: 'outcome',
              status: result.exitCode === 0 ? 'passed' : 'failed',
            },
          ],
        }
      },
    },
  ],
})
```

Files listed in a check's `files` option are withheld from the agent's initial workspace and copied in before that check runs.

Checks return either `outcomes` or `measurements`. Outcomes report a `passed`, `failed`, or `skipped` status. Measurements report numeric values, with optional units and a direction such as `higher-is-better` or `lower-is-better`.

### Judges

Judges use a model to evaluate the agent's output against a rubric. They are useful for criteria that are difficult to verify deterministically, such as visual consistency or the clarity of an interaction.

Define judges with the `judges` option. Each judge provides score definitions, along with optional instructions and a model:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add a search feature that filters the list of projects by name.',
  description: 'Evaluate whether the agent can add search to an existing application',
  judges: [
    {
      name: 'Search interaction',
      description: 'Evaluate how clearly the search feature communicates its behavior',
      model: 'gpt-5.6-luna',
      instructions: 'Evaluate the search labels, feedback, and empty state against the score definitions.',
      scores: [
        {
          value: 0,
          description: 'The search interaction is missing or unclear',
        },
        {
          value: 1,
          description: 'The search interaction is understandable but lacks useful feedback or an empty state',
        },
        {
          value: 2,
          description: 'The search interaction has clear labels, useful feedback, and a helpful empty state',
        },
      ],
    },
  ],
})
```

Judges run after the agent completes the task and return a score with a rationale and findings.

Check files and judge reference files must stay inside the scenario directory, including after resolving symlinks. Referenced entries must not themselves be symlinks.

### Image

Use `image` to customize the environment where a scenario runs. This is useful when a task needs a different Node.js version, additional system packages, or dependencies installed ahead of time.

If you omit `image`, agent-eval uses its default Node.js image, copies in the scenario files, and runs the default setup to install dependencies and build the starting project.

#### Use an existing image

Provide an image reference to use as the base for the scenario:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add a search feature that filters the list of projects by name.',
  image: 'node:26-slim',
})
```

You can also write this as `image: {name: 'node:26-slim'}`. Agent-eval copies the scenario files into `/home/sandbox/workspace` on top of that image.

#### Build from a Dockerfile

Provide a Dockerfile to control how the starting workspace is built:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add a search feature that filters the list of projects by name.',
  image: {
    dockerfile: 'Dockerfile',
    context: '.',
  },
})
```

Both paths are resolved relative to the scenario directory. Absolute paths are also supported. The build context defaults to the scenario directory when `context` is omitted.

Your Dockerfile is responsible for copying the project into `/home/sandbox/workspace` and preparing it for the agent:

```dockerfile
FROM node:26-slim

WORKDIR /home/sandbox/workspace

COPY . .
RUN npm install \
    && npm run build --if-present
```

Files declared in a check's or judge's `files` option are excluded from the build context so they are not available to the implementation agent.

#### Setup and compatibility

Setting `image` disables the default scenario setup. Install dependencies and build the starting project in your Dockerfile or in a scenario `setup` callback. An explicit `setup` callback also replaces the default setup when `image` is omitted.

Agent-eval adds its Copilot tools and sandbox configuration on top of the scenario image. The current sandbox expects a Debian-compatible base with `apt-get`, npm, and a `node` user and group with UID/GID `1000`. The Debian-based official Node.js images are a starting point; Alpine images are not supported by this setup.

## CLI

Use the `scenario` subcommand to run a scenario or manage its Docker images. Scenario names are folder names inside `./scenarios`. Use `--scenarios <directory>` to look up scenarios in a different directory.

### Run a scenario

Run an individual scenario:

```bash
agent-eval scenario run 001-agent-scenario
```

Use `--check <check-name>` to select a specific check. To compare models or treatments across scenarios, include them in a benchmark or experiment.

### Build an image

Build a scenario's image without running the agent, checks, or judges:

```bash
agent-eval scenario image build 001-agent-scenario
```

The command uses the scenario's `image` configuration, or the default image when none is configured. It builds the starting workspace image, not the final sandbox with Copilot tools, and does not run scenario `setup` callbacks.

This is useful for checking a Dockerfile before starting an evaluation. Evaluation runs build the scenario image automatically, so this is an optional step. Both paths can reuse Docker's build cache.

To build a scenario from another directory:

```bash
agent-eval scenario image build 001-agent-scenario --scenarios ./fixtures
```

### Remove images

Remove locally tagged images for a specific scenario:

```bash
agent-eval scenario image clean 001-agent-scenario
```

This targets local images with tags matching `agent-eval/scenarios/001-agent-scenario:`, including older builds, rather than only the image for the current configuration.

To clean up agent-eval images more broadly, omit the scenario name:

```bash
agent-eval scenario image clean
```

**This targets local scenario, sandbox, and shared tools images across projects.** Cleanup is based on image tags, not the scenarios directory, so `--scenarios` does not limit its scope. Prefer the named command when you only want to clean up one scenario.

### Requirements and help

Image commands require a running Docker daemon but do not require a Copilot token. Running an evaluation also requires `COPILOT_GITHUB_TOKEN` or `--token`.

Use command-specific help to see the available options:

```bash
agent-eval scenario --help
agent-eval scenario image build --help
agent-eval scenario image clean --help
```
