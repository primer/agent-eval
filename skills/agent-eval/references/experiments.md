# Experiments

An experiment compares interventions on the same tasks. Use it to evaluate a
skill, instructions, MCP server, custom agent, plugin, or execution backend.
Use a [benchmark](benchmarks.md) when the goal is a stable capability baseline.

```ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'API guidance',
  description: 'Test whether API guidance improves agent choices on a migration task',
  models: [{name: 'gpt-5.4', reasoningEfforts: ['low']}],
  scenarios: ['001-migration'],
  treatments: [
    {
      name: 'API instructions',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction('Consult the installed package types before choosing replacement APIs.')
      },
    },
  ],
})
```

Save as `experiments/api-guidance.ts`, create the referenced scenario, and run:

```sh
npx agent-eval experiment plan create api-guidance --output-path ./api-plan.json
npx agent-eval experiment plan run --plan-path ./api-plan.json --output-dir ./results/api-guidance-01
```

Required fields are `name`, `description`, `models`, `scenarios`, and
`treatments`. `setup` and `runners` are optional. Export the named `experiment`
configuration; a default export is also supported.

## Shared setup versus treatment setup

Top-level experiment `setup({sandbox})` runs for **every trial**, including
control. Use it for neutral prerequisites. Each treatment's setup runs
afterward and installs only that intervention.

The harness automatically adds `Control`. Treatment names must be unique and
cannot be `Control`. A configuration with `treatments: []` runs control only.

Experiment scenarios can also use `{path: './fixtures/task', name: 'task'}`.
`path` resolves from the host process's working directory, not from the
experiment file; `name` is an optional scenario ID override. Prefer ordinary
scenario folder IDs for an introductory project.

## Keep the comparison bounded

Start with one model, one effort, one scenario, and one treatment. With one
runner, this creates two trials. In general:

```text
trials = model variants * scenarios * unique runners * (configured treatments + 1)
```

`runners: ['copilot-cli', 'copilot-sdk']` compares both backends and doubles that
dimension. Omit it to use the CLI runner. See [models and runners](models-and-runners.md).

Hold other dimensions fixed when measuring the effect of a resource. If both
the intervention and runner change, their effects are confounded. Repeat runs
with distinct output directories when results are close; there is no repetition
field in the configuration.

Describe the behavioral hypothesis, inspect per-scenario failures, and reserve
new tasks for checking generalization. The tiny [getting-started](getting-started.md)
example is a wiring check, not a sufficient experiment for selecting a resource.
