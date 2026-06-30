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
      name: 'local-button-eval',
      path: './evals/button',
    },
  ],
  treatments: [],
}
```
