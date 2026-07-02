# agent-eval

> Tools for evaluating the performance of agents on Primer-related tasks.

## Overview

This project creates a framework used for running experiments. In each
experiment, we establish treatments that are then used to setup the environment
for the agent before completing evaluations. These evaluations (evals) represent
a scenario where, given a prompt, we are evaluating how the agent behaves.

This framework allows us to test the effectiveness of different experimental
treatments on the evaluations we care about. In particular, we score results
based on:

- Correctness: how many of the tests does the agent output pass
- Cost: how much did the agent spend in API calls
- Latency: how long did the agent take to complete the evals

## Experiments

Experiments live in [`./experiments/src`](./experiments/src/). Each experiment
is a new TypeScript file that exports an experiment config:

```ts
import type {ExperimentConfig} from '@primer/agent-experiment'

export const experiment: ExperimentConfig = {
  name: 'Example experiment',
  description: 'Experiment config demonstrating different options',
  models: ['gpt-5.5', 'claude-opus-4.7', 'claude-sonnet-4.6'],
  evals: ['001-agent-uses-button-from-primer', '002-agent-uses-octicon-from-primer'],
  treatments: [
    {
      name: 'Treatment one',
      async setup({sandbox}) {
        // ...
      },
    },
    {
      name: 'Treatment two',
      async setup({sandbox}) {
        // ...
      },
    },
  ],
}
```

Treatments can configure custom Copilot sub-agents under `~/.copilot/agents`.
Use `files` when the sub-agent should reference additional local files, folders,
or inline content:

```ts
export const experiment: ExperimentConfig = {
  name: 'Custom agent experiment',
  description: 'Compare behavior with a custom implementation planner',
  models: ['gpt-5.5'],
  evals: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With custom sub-agent',
      async setup({sandbox}) {
        await sandbox.addCustomAgent('implementation-planner', 'Plans implementation work', 'Create concise plans.', {
          tools: ['read', 'search'],
          files: [
            {
              sourcePath: './docs/planning-guidelines.md',
              destinationPath: 'implementation-planner/guidelines.md',
            },
            {
              path: 'implementation-planner/context.md',
              content: 'Prefer short, actionable implementation plans.',
            },
          ],
        })
      },
    },
  ],
}
```

Treatments can also configure Copilot skills under `~/.agents/skills`.
Use `files` when the skill should include additional local files, folders, or
inline content next to `SKILL.md`:

```ts
export const experiment: ExperimentConfig = {
  name: 'Skill experiment',
  description: 'Compare behavior with a planning skill',
  models: ['gpt-5.5'],
  evals: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With planning skill',
      async setup({sandbox}) {
        await sandbox.addAgentSkill('planning', 'Plans implementation work', 'Create concise plans.', {
          files: [
            {
              sourcePath: './docs/planning-guidelines.md',
              destinationPath: 'guidelines.md',
            },
            {
              path: 'context.md',
              content: 'Prefer short, actionable implementation plans.',
            },
          ],
        })
      },
    },
  ],
}
```

When authoring experiments outside of this repository, import the helper from
`@primer/agent-eval/config` to keep the experiment config typed:

```ts
import {createExperiment} from '@primer/agent-eval/config'

export const experiment = createExperiment({
  name: 'Example experiment',
  description: 'Experiment config demonstrating different options',
  models: ['gpt-5.5'],
  evals: ['001-agent-uses-button-from-primer'],
  treatments: [],
})
```

Run local experiments with the `agent-eval` CLI:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval --experiments ./experiments --experiment example
```

You can also provide a path directly to `--experiment`:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval --experiment ./experiments/example.ts
```

The experiment config will specify:

- A name for the experiment
- A description for the experiment describing more about what it is for
- Models against which you would like to run the experiment
- Evaluations (evals) that are used to grade the output of the model
- Treatments that specify the different conditions you would like to test (for
  example, testing with an MCP server versus without)

Evals can also be defined inline in an experiment. Inline eval paths resolve
from the directory where the CLI is run, and use the same `eval.config.ts` and
`eval.test.ts` files as repository evals:

```ts
export const experiment: ExperimentConfig = {
  name: 'Local project experiment',
  description: 'Run an eval from the current project',
  models: ['gpt-5.5'],
  evals: [
    {
      path: './evals/local-button-eval',
    },
  ],
  treatments: [],
}
```
