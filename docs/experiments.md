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

Use the `experiment` command group to run experiments, create and execute sharded
plans, merge results, or retry execution errors in an existing result bundle:

```sh
npx agent-eval experiment retry --output-dir ./results/comparison-01
```

Retry preserves completed trials and updates failed trials in place. Use
`npx agent-eval experiment --help` for commands and options. To repair an Actions
run, see [workflow recovery](workflow-recovery.md).

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

For evaluations without trial execution errors, each level includes run counts,
check summaries, and implementation-agent usage totals. Sharded runs show the
selected groups.
Scenario-backed experiments retain their existing report format.

On the website, experiment pages show overall treatment summaries, then
capability summaries with their scenario results. Runner, model, and reasoning
effort groups remain separate. Website resource usage is averaged per completed trial.
Scenario output links open the matching capability and scenario on the run
detail page, which also supports filtering by capability.

Benchmark-backed result bundles preserve capability metadata in `output.json`
and a `capabilityId` on each trial. Older experiment bundles without this
metadata remain readable, but their results stay grouped by scenario because
capability membership cannot be inferred reliably.

Trial files use `type: 'success'` for completed evaluations and `type: 'error'`
for exhausted failures. Error results retain trial identifiers and
`error: {name, message, stack?}`, without success-only fields or artifact paths.
Historical trial files without `type` parse as successes. Image, sandbox, stage,
and cleanup failures retry up to three times before being saved as errors;
they do not abort neighboring trials. Failed check assertions remain successful
trial executions with failing check outcomes.

Any trial execution error marks the selected evaluation incomplete. Reports
show the incomplete status and error details instead of comparative summaries,
scores, rankings, or usage deltas, even for otherwise successful groups.
Incomplete evaluations are excluded from website trends. Individual trial
details remain available for diagnosis.
