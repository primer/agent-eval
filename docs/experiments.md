# Experiments

Experiments are used to determine how different setups (or treatments) affect the performance of an agent on a given task. By default, they live in an `experiments` folder in your project.

Each experiment defines a set of scenarios, or references a benchmark whose
scenarios are used to evaluate each treatment. An experiment also defines a set
of models to use.

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

To compare treatments across a benchmark instead, replace `scenarios` with
`benchmark: 'design-system'`, using the benchmark file's name without its
extension. The experiment runs each distinct scenario from all benchmark
capabilities once per model and treatment. It uses the experiment's models and
setup, not the benchmark's models or setup. Benchmarks are read from
`./benchmarks` by default; use `--benchmarks <directory>` with `experiment run`,
`experiment plan create`, and `experiment plan run` when stored elsewhere.

## CLI

You can interact with experiments using the `experiments` subcommand of the `agent-eval` CLI. This sub-command gives you access to run experiments, create run plans to use for sharding, or merge the results of a plan.

Use `agent-eval experiments --help` to see the available commands and options.
