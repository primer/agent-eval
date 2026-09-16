# Benchmarks

A benchmark establishes a reusable baseline organized by
[capabilities](capabilities.md). Choose it when you want to track how well your
current setup supports a stable set of tasks across models or over time.

```ts
import {defineConfig} from '@primer/agent-eval/benchmark'

export const benchmark = defineConfig({
  name: 'Project baseline',
  description: 'Evaluate the capabilities supported by our project guidance',
  models: [{name: 'gpt-5.4', reasoningEfforts: ['low']}],
  async setup({sandbox}) {
    await sandbox.addAgentInstruction('Consult the project documentation before choosing an API.')
  },
  capabilities: [
    {
      name: 'Navigation',
      scenarios: ['001-navigation'],
    },
  ],
})
```

Save this as `benchmarks/project.ts`, provide the referenced scenario, then run:

```sh
npx agent-eval benchmark run project --output-dir ./results/project-baseline
```

Required fields are `name`, `description`, `models`, and `capabilities`.
`setup` is optional. Export `benchmark` or a default configuration.

Each capability/scenario/model combination runs with two treatments:

- `Control`, without the benchmark-level setup.
- `Benchmark`, with the benchmark-level setup.

Capability-level setup runs in **both** conditions. Use it for neutral
prerequisites, not the knowledge whose effect you want to measure.
Without benchmark setup, the two treatment environments are effectively the
same; that can check wiring but does not test an intervention.

Trial count is model variants multiplied by scenario memberships across all
capabilities, multiplied by two. A scenario appearing in two capabilities runs
in each capability. There is no benchmark `treatments` or `runners` array;
use an experiment for multiple interventions and `--runner` for a different
benchmark implementation backend.

The CLI identifier is the configuration filename without its extension
(`project`), not the display `name`. Keep capability names stable when using
saved plans. See [plans](plans.md) to inspect or distribute a larger benchmark.
