# Experiments

**Use when:** comparing instructions, skills, MCP servers, custom agents,
plugins, or execution backends on the same tasks. Use a
[benchmark](benchmarks.md) for a stable capability baseline.

## Contract

| Item                | Rule                                                                       |
| :------------------ | :------------------------------------------------------------------------- |
| File and import     | `experiments/<id>.ts`; `defineConfig` from `@primer/agent-eval/experiment` |
| Export              | Prefer named `experiment`; default also supported                          |
| Required fields     | `name`, `description`, `models`, `scenarios`, `treatments`                 |
| Optional fields     | `setup`, `runners`                                                         |
| CLI identifier      | Filename without extension, not display `name`                             |
| Scenario references | Folder IDs; alternatively `{path, name?}`                                  |
| Runner default      | `copilot-cli`                                                              |

Top-level `setup` runs for **all trials, including control**. Put only neutral
prerequisites there. Treatment setup runs afterward and installs the intervention.
Do not put the tested resource in shared setup or the fixture.

The harness adds `Control` automatically. Treatment names must be unique and
cannot be `Control`. `treatments: []` runs control only.

## Minimal example

Prerequisite: create `001-labels` from [getting started](getting-started.md).
Save this complete configuration as `experiments/verification.ts`:

```ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Verification instructions',
  description: 'Test whether verification instructions improve correctness on a small transformation task',
  models: [{name: 'gpt-5.4', reasoningEfforts: ['low']}],
  scenarios: ['001-labels'],
  treatments: [
    {
      name: 'Verification instructions',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction(
          'Before finishing, verify behavior with representative inputs and edge cases.',
        )
      },
    },
  ],
})
```

This is a runnable wiring example, not sufficient evidence for selecting a
resource. Replace it with a representative task and behavioral hypothesis for
your project.

## Run

```sh
npx agent-eval experiment plan create verification --output-path ./verification-plan.json
npx agent-eval experiment plan run --plan-path ./verification-plan.json --output-dir ./results/verification-01
```

Inspect the plan before executing the second command. Hold the prompt,
fixture, grader, model, effort, and runner fixed when comparing resources.

## Verify

- The example plan contains two trials: control plus the configured treatment.
  Only their treatment IDs differ, apart from unique trial IDs.
- Each trial has readable results, and grader errors are distinct from failures.
- Session and workspace evidence support any claim that the intervention
  changed behavior. Installation alone does not prove use.

## Pitfalls

Start with one model, effort, scenario, runner, and treatment beyond control.
The matrix expands as follows:

```text
trials = model variants * scenarios * unique runners * (configured treatments + 1)
```

`runners: ['copilot-cli', 'copilot-sdk']` adds a backend comparison. Changing both
runner and resource confounds their effects; see [models and runners](models-and-runners.md).

For inline scenario references, `path` resolves from the host working directory,
not the experiment file. `name` optionally overrides the scenario ID.

Repeat close comparisons in separate output directories; there is no repetition
field. Inspect per-scenario regressions and use held-out tasks before claiming
generalization.
