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

## Running against a benchmark

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

Results retain capability membership and a snapshot of the benchmark's name and
scenario grouping. A scenario used by multiple capabilities has separate trials
for each membership. Terminal reports show capabilities before their treatment
and scenario breakdowns. Saved plans reject changed benchmark grouping when
replayed; create a new plan after editing the benchmark.

In the results website, benchmark-backed experiments show a capability
comparison matrix with Control, Benchmark, and custom treatments side by side.
Select a model, reasoning effort, runner, metric, and comparison reference, then
select a capability to see its scenario comparisons. Scenario links open the
corresponding capability's trial details. The same matrix is available for
historical runs and uses their saved benchmark metadata.

For example, compare verification instructions to the standard configured in
`benchmarks/example.ts`:

```ts
// experiments/benchmark-comparison.ts
import {defineConfig} from '@primer/agent-eval/experiment'

export const experiment = defineConfig({
  name: 'Benchmark comparison',
  description: 'Compare verification instructions against the existing benchmark standard',
  models: ['gpt-6-sol'],
  benchmark: 'example',
  treatments: [
    {
      name: 'Verification instructions',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction('Before finishing, verify the implementation against the task requirements.')
      },
    },
  ],
})
```

Create a plan and inspect it before running:

```sh
npx agent-eval experiment plan create benchmark-comparison --output-path ./comparison-plan.json
npx agent-eval experiment plan run --plan-path ./comparison-plan.json --output-dir ./results/comparison-01
```

The plan includes Control, Benchmark, and Verification instructions for each
capability/scenario membership and model variant. An experiment's optional
`runners` array adds a runner dimension, or `--runner` selects one backend when
creating a new plan. To shard and merge, use the same experiment commands as for
scenario-based experiments.

No new overall benchmark score is calculated. Check metrics keep their existing
units, directions, and treatment-specific coverage; resource usage is averaged
per trial. A larger capability contributes more trials, not an implicitly
equal-weighted capability score.

## Loaded experiments

`getExperiment` and `listExperiments` return a discriminated union. Narrow on
`experiment.type`: `'scenarios'` provides `experiment.scenarios`, while
`'benchmark'` provides a required `experiment.benchmark` with its capabilities.
Configuration still uses exactly one of `scenarios` or `benchmark`; no `type`
field is needed in your config.

When loading benchmark-backed experiments, explicitly pass `benchmarksDirectory`
to `getExperiment` or `listExperiments`. The library does not default this path.
It can be omitted or undefined when loading only scenario-backed experiments.

Use `getExperimentScenarios` from `@primer/agent-eval` when you need the unique
scenarios for either kind of experiment without handling the variants yourself.

New experiment plan manifests include the same `type` discriminator.
Benchmark-backed plans require benchmark metadata and a `capabilityId` on every
trial. Scenario-backed plans contain neither. Replay accepts existing untagged
manifests and rejects changes to the experiment's source kind.

## CLI

You can interact with experiments using the `experiment` subcommand of the `agent-eval` CLI. This subcommand gives you access to run experiments, create run plans to use for sharding, or merge the results of a plan.

Use `agent-eval experiment --help` to see the available commands and options.
