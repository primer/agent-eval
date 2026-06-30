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
