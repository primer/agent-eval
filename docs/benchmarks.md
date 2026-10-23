# Benchmarks

Benchmarks are used to establish a baseline for agent performance on a given task. By default, they live in a `benchmarks` folder in your project.

Each benchmark is made up of a capabilities. These capabilities are used to determine if the agent is able to complete the task. Each capability has a name and a set of scenarios that are used to evaluate the agent's performance.

As an example, you may be creating a design system benchmark. In it, one of the
capabilities is around the LLM's usage of icons from your system. You could have
different scenarios within this icon usage capability that test the different
parts of icon usage that you care about.

## Config

Configuration for benchmarks live in the `/benchmarks` folder. You can add a
benchmark by adding a file to this folder and using `defineConfig` from `@primer/agent-eval/benchmark`.

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

## CLI

Use the `benchmark` command group to run benchmarks, create and execute sharded
plans, merge results, or retry execution errors in an existing result bundle:

```sh
npx agent-eval benchmark retry --output-dir ./results/baseline-01
```

Retry preserves completed trials and updates failed trials in place. Use
`npx agent-eval benchmark --help` for commands and options. To repair an Actions
run, see [workflow recovery](workflow-recovery.md).
