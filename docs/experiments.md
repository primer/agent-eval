# Experiments

Experiments are used to determine how different setups (or treatments) affect the performance of an agent on a given task. By default, they live in an `experiments` folder in your project.

Each experiment defines a set of scenarios that are used to evaluate the
performance of each treatment. An experiment also defines a set of models to
use.

As an example, you may want to design an experiment comparing the performance of
your MCP server to a skills based approach. With this in mind, you create two
treatments where you install your MCP server in one treatment and install a skills based approach in the other.

Along with these treatments, you decide on a set of scenarios that you want to
compare the two approaches against. When you run the experiment, you'll see
which approach performed best given the specific scenario, model, and treatment.

## Config

Configuration for experiments live in the `/experiments` folder. You can add a
experiment by adding a file to this folder and using `defineConfig` from `@primer/agent-eval/experiment`.

```ts
// experiments/example.ts
import {defineConfig} from '@primer/agent-eval/experiment'

export default defineConfig({
  name: 'Example experiment',
  description: 'An illustrative experiment showing how to use @primer/agent-eval',
  models: ['gpt-5.6-sol', 'claude-opus-5'],
  scenarios: ['001-agent-scenario', '002-agent-scenario', '003-agent-scenario'],
  treatments: [
    {
      name: 'MCP',
      async setup({sandbox}) {
        await sandbox.addMcpServer('acme', {
          type: 'local',
          command: 'npx',
          args: ['@acme/mcp'],
          tools: ['*'],
        })
      },
    },
    {
      name: 'Skill',
      async setup({sandbox}) {
        await sandbox.addAgentSkill('acme', 'acme skill description', 'acme skill contents')
      },
    },
  ],
})
```

## CLI

### Running against a benchmark

Use `benchmark: '<filename-id>'` instead of `scenarios` to evaluate every
capability and scenario in an existing benchmark. Specify exactly one of these
fields. Models and runners come from the experiment, not the benchmark.

Benchmark-backed experiments automatically run `Control` and `Benchmark`
alongside your configured treatments. `Benchmark` uses the benchmark's
top-level setup; other treatments do not inherit it. Both names are reserved in
benchmark-backed experiments. An empty `treatments` array compares the two
references.

Scenario setup runs first, followed by capability setup, experiment setup,
and the selected treatment's setup. Capability and experiment setup apply to
every treatment, including Control, so keep them neutral.

Reference benchmarks by filename without the extension, such as
`benchmark: 'design-system'` for `benchmarks/design-system.ts`. The `--benchmarks`
option selects another benchmark directory for experiment run and plan commands.

You can interact with experiments using the `experiments` subcommand of the `agent-eval` CLI. This sub-command gives you access to run experiments, create run plans to use for sharding, or merge the results of a plan.

Use `agent-eval experiments --help` to see the available commands and options.

## Loaded experiments

`getExperiment` and `listExperiments` return a discriminated union. Narrow on
`experiment.type`: `'scenarios'` provides `experiment.scenarios`, while
`'benchmark'` provides a required `experiment.benchmark` with its capabilities.
Configuration still uses exactly one of `scenarios` or `benchmark`; no `type`
field is needed in your config.

Use `getExperimentScenarios` from `@primer/agent-eval` when you need the unique
scenarios for either kind of experiment without handling the variants yourself.

New experiment plan manifests include the same `type` discriminator.
Benchmark-backed plans require benchmark metadata and a `capabilityId` on every
trial. Scenario-backed plans contain neither. Replay accepts existing untagged
manifests and rejects changes to the experiment's source kind.
