# @primer/agent-eval

A CLI tool and library for evaluating agent performance.

## Getting started

Install `@primer/agent-eval` in your project by running the following command
with [`npm`](https://npmjs.org):

```bash
npm install @primer/agent-eval --save-dev
```

This package provides a CLI through `agent-eval` which allows you to create and
run [benchmarks](#benchmarks) or [experiments](#experiments) to evaluate agent performance on a variety of
tasks. Benchmarks are used to establish a baseline for agent performance on a given task, while experiments are used to test different approaches to improve performance on that task.

To learn more about the CLI or about how create benchmarks and experiments,
check out the sections below.

## CLI

The main way you'll interact with `@primer/agent-eval` is through its CLI. It
provides you access to create, run or plan [benchmarks](#benchmarks), [experiments](experiments), and [scenarios](#scenarios).

Typically, you will run either benchmarks with the command:

```bash
agent-eval benchmarks run <benchmark-name>
```

You will also run experiments with the following command:

```bash
agent-eval experiments run <experiment-name>
```

Both of these commands will kick-off the evaluation of the given benchmark or
experiments. Under-the-hood, we are going through each scenario and setting up a
sandbox where the agent executes within. When all evaluations are complete, a
result is returned detailing how each agent performed relative to each other.

## Benchmarks

Benchmarks are used to establish a baseline for agent performance on a given task. By default, they live in a `benchmarks` folder in your project. You can create a benchmark by importing and using `defineConfig` from
`@primer/agent-eval/benchmark`. For example:

```ts
// benchmarks/example.ts
import {defineConfig} from '@primer/agent-eval/benchmark'

export default defineConfig({
  name: 'Example benchmark',
  description: 'An illustrative benchmark showing how to use @primer/agent-eval',
  models: ['gpt-5.6-sol', 'claude-opus-5'],
  async setup({sandox}) {
    // Run the setup necessary for your benchmark, like adding an MCP server
    await sandbox.addMcpServer('acme', {
      type: 'local',
      command: 'npx',
      args: ['@acme/mcp'],
      tools: ['*'],
    })
  },
  capabilities: [
    {
      name: 'Example capability',
      scenarios: ['001-agent-scenario'],
    },
  ],
})
```

Benchmarks describe a set of capabilities that are evaluated against the
different models provided. The goal is to use these to establish a base set of
results that you can measure over time.

The `setup` that you provide is used to setup the internal sandbox with your current LLM setup, such as your skills or
MCP server. This setup is compared against a control to gauge how much better
the agent performs with your current setup compared to no setup.

Each capability is made up of [scenarios](#scenarios). These are the folder
names of scenarios that are in a `scenarios` folder by default. These scenarios
are used by the capability to evaluate its performance in different areas.

For example, you might have a capability that looks to see if the icons from
your design system are used appropriately. Each scenario in that capability may
test a different thing, from testing that it uses icons from default to
inferring the correct semantic meaning of an icon in a new context.

You can run benchmarks using the CLI by running the following command:

```bash
agent-eval benchmarks run <benchmark-name>
```

To learn more about benchmarks, visit our [benchmark docs](../../docs/benchmarks.md).

## Experiments

Experiments are used to test different approaches to improve performance on a set of tasks. By default, they live in an `experiments` folder in your project. You can create an experiment by importing and using `defineConfig` from
`@primer/agent-eval/experiment`. For example:

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

In this experiment, we're looking at two treatments to see which one performs
best against the given scenarios.

You can run experiments using the CLI by running the following command:

```bash
agent-eval experiments run <experiment-name>
```

When an experiment is run, each treatment is evaluated against the given scenarios. The results are then compared to see which treatment performed best.

To learn more about experiments, visit our [experiment docs](../../docs/experiments.md).

## Scenarios

Scenarios are used to evaluate agent performance on a given task. By default, they live in a `scenarios` folder in your project. You can create a scenario by creating a folder with the name of the scenario and adding a `scenario.config.ts` file. In that file, you can import and use `defineConfig` from `@primer/agent-eval/scenario`. For example:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Prompt for the scenario that is passed to the agent',
  description: 'A description of the scenario and what it tests for',
})
```

The contents of the scenario are copied into the sandbox and passed to the agent as a prompt. The agent's response is then evaluated against the expected output to see how well it performed.

To evaluate how well the agent performed on the task, you can use the [`checks`](#checks) config option for
deterministic verification or the [`judges`](#judges) config option for non-deterministic
verification.

To learn more about scenarios, visit our [scenario docs](../../docs/scenarios.md).

### Checks

Checks are used to deterministically evaluate how well an agent performed on a
task. You can use them to run tools like vitest or eslint and report back their
results. You can also use them as general scripts to run your own checks, such
as:

- Figuring out how different the scenario is from a baseline snapshot
- Figuring how much files include (or don't include) an import statement (useful
  for migration work)
- Figuring out how similar a generated file is from a baseline file

Checks are available with the `checks` option in a `scenario` config:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Prompt for the scenario that is passed to the agent',
  description: 'A description of the scenario and what it tests for',
  checks: [
    {
      name: 'tests',
      description: 'Verify that the agent output passes the tests',
      files: ['vitest.config.ts', 'scenario.test.ts'],
      async run({sandbox}) {
        // Run vitest and return the result
      },
    },
  ],
})
```

Checks can return outcomes or measurements. Outcomes are used to determine if the agent passed or failed the check, while measurements are used to determine how well the agent performed on the check.

In the case above, we might return something like:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Prompt for the scenario that is passed to the agent',
  description: 'A description of the scenario and what it tests for',
  checks: [
    {
      name: 'tests',
      description: 'Verify that the agent output passes the tests',
      files: ['vitest.config.ts', 'scenario.test.ts'],
      async run({sandbox}) {
        // ...
        return {
          outcomes: testResults.map(testResult => {
            return {
              type: 'outcome',
              status: testResult.status,
            }
          }),
        }
      },
    },
  ],
})
```

### Judges

Judges are non-deterministic evaluations of how well an agent performed on a task. These represent the LLM-as-a-judge concept, allowing you to define different criteria and how a model should judge the output of a scenario based on a given rubric.

You can define judges using the `judge` option in a scenario:

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Prompt for the scenario that is passed to the agent',
  description: 'A description of the scenario and what it tests for',
  judges: [
    {
      name: 'Example judge',
      description: 'An example judge that evaluates the agent output based on a given rubric',
      model: 'gpt-5.6-luna',
      instructions: 'Instructions for the judge that are provided as part of the prompt',
      scores: [
        {
          value: 0,
          description: 'The agent output is completely incorrect or irrelevant',
        },
        {
          value: 1,
          description: 'The agent output is partially correct or relevant, but has significant issues',
        },
        {
          value: 2,
          description: 'The agent output is mostly correct or relevant, but has some minor issues',
        },
        {
          value: 3,
          description: 'The agent output is completely correct or relevant',
        },
      ],
    },
  ],
})
```

Judges are run after a scenario completes and use the provided instructions and score
definitions to provide the state of the deliverable by the agent.

## License

Licensed under the [MIT License](../../LICENSE).
