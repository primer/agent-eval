# @primer/agent-eval

Run Primer agent evaluation experiments from the command line or from Node.js.

## CLI

Install the package and run the `agent-eval` binary with a GitHub token:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval --experiments ./experiments --experiment example
```

Use `--experiments` to load experiment files from a local directory. Experiment
files may export an `experiment` named export or a default export.

## Experiment config authoring

Use `createExperiment` from `@primer/agent-eval/config` to keep local experiment
files typed:

```ts
import {createExperiment} from '@primer/agent-eval/config'

export const experiment = createExperiment({
  name: 'Example experiment',
  description: 'Compare treatment behavior',
  models: ['gpt-5.5'],
  evals: ['001-agent-uses-button-from-primer'],
  treatments: [],
})
```

## Programmatic usage

The package index exports the experiment loading and runner APIs:

```ts
import {loadExperimentConfigs, run} from '@primer/agent-eval'
```
