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

## CLI

You can run an individual scenario using the `scenario` subcommand of the `agent-eval` CLI:

```bash
agent-eval scenario run 001-agent-scenario
```

Use `--check <check-name>` to select a specific check. To compare models or treatments across scenarios, include them in a benchmark or experiment.

Use `agent-eval scenario --help` to see the available commands and options.
