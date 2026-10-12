# Experiments

Experiments are used to determine how different setups (or treatments) affect the performance of an agent on a given task. By default, they live in an `experiments` folder in your project.

Each experiment defines either a set of scenarios or a benchmark whose
capabilities and scenarios are used to evaluate each treatment. An experiment
also defines a set of models to use.

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

You can interact with experiments using the `experiments` subcommand of the `agent-eval` CLI. This sub-command gives you access to run experiments, create run plans to use for sharding, or merge the results of a plan.

Use `agent-eval experiments --help` to see the available commands and options.

### Resume and retry

Experiment runs capture trial execution failures as `error: {name, message}`
in individual trial results and continue other trials. Reports show execution
errors separately from successful runs and their metrics. Check failures and
judge-reported errors do not mark the trial itself as an execution failure.

Direct runs save their plan to `<output-dir>/plan.json` and checkpoint completed
trials under `artifacts/.checkpoints/`. To retry failed or missing trials without
rerunning successful ones:

```sh
npx agent-eval experiment run example --output-dir ./results/example
npx agent-eval experiment run example --output-dir ./results/example --resume
```

Saved plans also support `experiment plan run --resume`; keep the same plan,
output directory, and any shard/runner selection. Interrupted runs can resume
even before `output.json` is written. Retried trials start from the beginning,
retain their IDs, and replace their failed result on completion.

Preserve the plan, checkpoints, and successful artifacts, and keep the source,
configuration, dependencies, and setup resources unchanged between attempts.
Resume checks trial identities but does not detect source changes. Use a fresh
output directory for a changed evaluation. Corrupt or mismatched checkpoints,
configuration failures, and result-storage failures still fail the command.

## Reports

Experiment runs print a summary grouped by treatment, scenario, and model
variant. When the experiment selects a `benchmark` instead of `scenarios`, the
report adds a `Capability` column and capability totals between each treatment
and its scenarios:

```text
treatment
  capability
    scenario
      model / reasoning effort
```

Treatment totals include all completed capabilities. Scenarios and model
variants are grouped separately within each capability, even when a scenario
appears in more than one capability. Reports keep runner results separate and
show a `Runner` column when SDK trials are present.

Each level includes run counts, check summaries, and implementation-agent usage
totals. Partial or sharded runs show only the groups with completed results.
Scenario-backed experiments retain their existing report format.

On the website, experiment pages show overall treatment summaries, then
capability summaries with their scenario results. Runner, model, and reasoning
effort groups remain separate. Website resource usage is averaged per trial.
Scenario output links open the matching capability and scenario on the run
detail page, which also supports filtering by capability.

Benchmark-backed result bundles preserve capability metadata in `output.json`
and a `capabilityId` on each trial. Older experiment bundles without this
metadata remain readable, but their results stay grouped by scenario because
capability membership cannot be inferred reliably.
