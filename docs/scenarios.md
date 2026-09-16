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

The scenario's workspace files are baked into a Docker image used by each trial's
[sandbox](./sandbox.md), where the agent works on the task described by `prompt`.
The `description` explains what the scenario evaluates.

Add `checks` for deterministic verification, `judges` for model-based evaluation, or both.

### Image-backed workspaces

Use `workspace.source: 'image'` when a Docker image provides the complete starting
project at `/home/sandbox/workspace`:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add search to the existing application.',
  workspace: {
    source: 'image',
    image: 'ghcr.io/example/project:latest',
  },
})
```

Alternatively, build a local Dockerfile:

```ts
workspace: {
  source: 'image',
  dockerfile: './Dockerfile',
  context: '.',
},
```

Specify either `image` or `dockerfile`, not both. Dockerfile and context paths
are relative to the scenario directory. The context defaults to that directory;
the Dockerfile must be inside it. Set `context` to a parent directory when the
build needs other local project files. The context's `.dockerignore` controls
which files are sent to Docker.

The Dockerfile is responsible for placing files in the workspace, installing
project dependencies, and any initial build. For example:

```dockerfile
FROM node:26.5.0-slim
WORKDIR /home/sandbox/workspace
COPY project/package.json project/package-lock.json ./
RUN npm ci
COPY project/ ./
RUN npm run build --if-present
```

For these scenarios, the harness does not copy the scenario directory, rewrite
`package.json`, install project dependencies, or run the project's build script.
The local scenario `package.json` remains evaluation tooling unless the
Dockerfile explicitly copies it. Shared and treatment setup still run per trial.
Check and judge files are still injected for evaluation, using their
workspace-relative paths. Do not bake private grading files into the image.

The scenario image takes precedence over `--docker-image` in standalone runs,
benchmarks, and experiments. Local builds are shared by trials of the same
scenario within a run. A new run rebuilds against the current context using
Docker's layer cache.

Images must be Debian-based Node images with npm, `apt-get`, and a `node` user.
The harness layers its runtime tooling on top, resets the entrypoint, and runs
commands from `/home/sandbox/workspace` as `node`. This is not an option for
running arbitrary images without modification.

Omitting `workspace` generates a scenario image automatically, as described below.
Artifact collection is unchanged and still downloads the workspace with its
standard exclusions.

### Generated images and prebuilding

Ordinary scenarios do not need a Dockerfile. The harness generates one that
copies the starting files, withholds evaluation files and host dependencies,
replaces the package name with `agent-eval-scenario`, removes
`devDependencies.@primer/agent-eval`, and runs `npm install`.
That image is shared by the scenario's trials; each trial gets its own container.

The package name is changed to the trial ID before setup hooks run. Shared and
treatment setup remain per trial, followed by `npm run build --if-present`.
Keeping this build after the hooks preserves projects whose build depends on
treatment setup. Package installation scripts run while building the image,
before the trial ID is assigned. Build steps must not require per-trial state.

Prebuild one scenario or all scenarios without running agents:

```bash
agent-eval scenario build 001-agent-scenario
agent-eval scenario build
```

These commands require Docker, but no Copilot token. They support `--scenarios`
and `--docker-image`, and print one JSON object per image:

```json
{"scenario": "001-agent-scenario", "image": "agent-eval-scenario:..."}
```

Both generated and explicitly configured images can be prebuilt. Builds use
Docker's layer cache, so a later run with the same context and base image reuses
the prepared layers. Source or dependency changes invalidate the relevant layers.
To move an image to another machine, tag and push the returned image to your
registry and reference it with `workspace.image`. An explicitly selected image
owns its initial build; it does not get the ordinary scenario's per-trial build.
Prebuilding does not execute setup hooks, the per-trial build, checks, judges,
or walkthrough capture.

From the library:

```ts
import {buildScenarioImage, getScenario} from '@primer/agent-eval'

const scenario = await getScenario({directory: './scenarios', name: '001-agent-scenario'})
const image = await buildScenarioImage({scenario})
```

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

## CLI

You can run an individual scenario using the `scenario` subcommand of the `agent-eval` CLI:

```bash
agent-eval scenario run 001-agent-scenario
```

Use `--check <check-name>` to select a specific check. To compare models or treatments across scenarios, include them in a benchmark or experiment.

Use `agent-eval scenario --help` to see the available commands and options.
