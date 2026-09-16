# Benchmarks

**Use when:** establishing a stable capability baseline across models or over
time. Use an [experiment](experiments.md) to compare multiple interventions.

## Contract

| Item                 | Rule                                                                     |
| :------------------- | :----------------------------------------------------------------------- |
| File and import      | `benchmarks/<id>.ts`; `defineConfig` from `@primer/agent-eval/benchmark` |
| Export               | Named `benchmark` or default                                             |
| Required fields      | `name`, `description`, `models`, `capabilities`                          |
| Optional field       | `setup`                                                                  |
| CLI identifier       | Filename without extension, not display `name`                           |
| Automatic treatments | `Control` and `Benchmark`                                                |

Benchmark-level `setup` runs only for `Benchmark`. Capability-level setup
runs for **both** treatments, before treatment setup. Put neutral prerequisites
in capability setup and the resource being measured in benchmark setup.

## Minimal example

Prerequisite: create `001-labels` from [getting started](getting-started.md).
Save this complete configuration as `benchmarks/project.ts`:

```ts
import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Project baseline',
  description: 'Evaluate verification guidance on a data transformation task',
  models: [{name: 'gpt-5.4', reasoningEfforts: ['low']}],
  async setup({sandbox}) {
    await sandbox.addAgentInstruction('Before finishing, verify behavior with representative inputs and edge cases.')
  },
  capabilities: [
    {
      name: 'Data transformation',
      scenarios: ['001-labels'],
    },
  ],
})
```

## Run

```sh
npx agent-eval benchmark plan create project --output-path ./project-plan.json
npx agent-eval benchmark plan run --plan-path ./project-plan.json --output-dir ./results/project-baseline
```

Inspect the plan before executing the second command. Runtime prerequisites
and credentials are covered in [getting started](getting-started.md).

## Verify

- The example plan contains two trials with the same scenario, model, effort,
  runner, and capability, but different treatment IDs.
- Both trial result files are readable through `output.json`.
- Check outcomes and session evidence show what each condition actually did.
  A passing command is not a passing benchmark.

## Pitfalls

Without benchmark setup, both treatment environments are effectively the same.
That can check wiring but does not measure an intervention.

Trial count is model variants multiplied by scenario memberships across all
capabilities, multiplied by two. A scenario in two capabilities runs in each.
There is no benchmark `treatments` or `runners` array; use an experiment for
multiple interventions and `--runner` to select a benchmark backend.

Keep capability names stable when reusing [plans](plans.md). See
[capabilities](capabilities.md) for grouping and shared-setup rules.
