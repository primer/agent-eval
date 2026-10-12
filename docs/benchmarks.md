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

You can interact with benchmarks using the `benchmarks` subcommand of the `agent-eval` CLI. This sub-command gives you access to run benchmarks, create run plans to use for sharding, or merge the results of a plan.

Use `agent-eval benchmarks --help` to see the available commands and options.

### Resume and retry

Benchmark runs capture trial execution failures in the trial result's optional
`error: {name, message}` field without stopping other trials. Reports count these
as errors, separately from successful runs and their check and usage summaries.
Check failures and judge-reported errors remain evaluation results, not trial
execution failures.

Direct runs save `plan.json` in the output directory before execution. Completed
trials are checkpointed under `artifacts/.checkpoints/` as they finish, so an
interrupted run can also be resumed:

```sh
npx agent-eval benchmark run example --output-dir ./results/example
npx agent-eval benchmark run example --output-dir ./results/example --resume
```

For a saved plan, repeat `benchmark plan run` with `--resume`, the same
`--plan-path`, `--output-dir`, and any shard/runner selection. Resume reuses
successful trials and reruns failed or missing trials from the beginning,
preserving trial IDs and rebuilding the output manifest. It does not resume
inside a trial. Keep the plan, checkpoints, and successful artifacts together.

Keep configuration, fixtures, dependencies, and setup resources unchanged
between attempts: a plan records identifiers, not a source snapshot. Start a
new run in a fresh output directory when changing the evaluation. Corrupt or
mismatched checkpoints cause resume to fail rather than overwrite saved work.
Configuration and result-storage failures still fail the command.
