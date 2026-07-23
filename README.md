# agent-eval

> Tools for evaluating the performance of agents on Primer-related tasks.

## What this project does

This project provides a framework for using agent-eval to evaluate scenarios.
Each experiment defines treatments that set up the agent's environment before
it completes one or more scenarios.

Scenarios represent tasks where, given a prompt, we measure how the agent
behaves. This framework helps compare the effectiveness of different treatments
against the scenarios we care about.

Results are scored by:

- Correctness: how many tests the agent's output passes
- Cost: how much the agent spends in API calls
- Latency: how long the agent takes to complete the scenarios

## Core concepts

- **Scenarios** describe the task and tests used to grade the agent's output.
- **Experiments** select the models, scenarios, and treatments to run together.
- **Treatments** define the conditions for a run, such as adding an MCP server,
  custom sub-agent, or skill before the scenario starts.

## Running experiments

Run local experiments with the `agent-eval` CLI:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval --experiments ./experiments/src --experiment mcp
```

You can also provide a path directly to `--experiment`:

```sh
COPILOT_GITHUB_TOKEN=... agent-eval --experiment ./experiments/src/mcp.ts
```

## Authoring scenarios

Scenarios live in [`./scenarios`](./scenarios/). Each scenario has a
`scenario.config.ts` file that defines the agent prompt and a `scenario.test.ts`
file that grades the agent's output:

```ts
import {defineScenario} from '@primer/agent-eval/scenario'

export default defineScenario({
  prompt: 'Update the index page to use a primary button',
})
```

## Authoring experiments

Experiments live in [`./experiments/src`](./experiments/src/). Each experiment
is a TypeScript file that exports an experiment config:

```ts
import type {ExperimentConfig} from '@primer/agent-experiment'

export const experiment: ExperimentConfig = {
  name: 'Example experiment',
  description: 'Experiment config demonstrating different options',
  models: ['gpt-5.5', 'claude-opus-4.7', 'claude-sonnet-4.6'],
  scenarios: ['001-agent-uses-button-from-primer', '002-agent-uses-octicon-from-primer'],
  treatments: [
    {
      name: 'Treatment one',
      async setup({sandbox}) {
        // ...
      },
    },
    {
      name: 'Treatment two',
      async setup({sandbox}) {
        // ...
      },
    },
  ],
}
```

The experiment config specifies:

- A name for the experiment
- A description explaining what the experiment is for
- Models against which to run the experiment
- Scenarios used to grade the model output
- Treatments that specify the different conditions to test

## Experiment options

Start with the basic experiment shape above, then add options as needed.

### Use the typed config helper

When authoring experiments outside of this repository, import the helper from
`@primer/agent-eval/config` to keep the experiment config typed:

```ts
import {createExperiment} from '@primer/agent-eval/config'

export const experiment = createExperiment({
  name: 'Example experiment',
  description: 'Experiment config demonstrating different options',
  models: ['gpt-5.5'],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [],
})
```

### Define inline scenarios

Scenarios can also be defined inline in an experiment. Inline scenario paths
resolve from the directory where the CLI is run, and use the same
`scenario.config.ts` and `scenario.test.ts` files as repository scenarios:

```ts
export const experiment: ExperimentConfig = {
  name: 'Local project experiment',
  description: 'Run a scenario from the current project',
  models: ['gpt-5.5'],
  scenarios: [
    {
      path: './scenarios/local-button-scenario',
    },
  ],
  treatments: [],
}
```

## Treatment options

Treatments can progressively add setup behavior for the agent environment.

### Configure MCP servers

Treatments can configure MCP servers for the agent to use during a scenario. For
example, install a server in the sandbox, add instructions for when to use it,
and register it with `addMcpServer`:

```ts
export const experiment: ExperimentConfig = {
  name: 'MCP experiment',
  description: 'Compare behavior with a Primer MCP server',
  models: ['gpt-5.5'],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With Primer MCP',
      async setup({sandbox}) {
        await sandbox.addAgentInstruction('For UI-related changes, use the Primer MCP server before editing.')
        await sandbox.runCommand('npm', ['install', '-g', '@primer/mcp@latest'])
        await sandbox.addMcpServer('primer', {
          type: 'local',
          command: 'npx',
          args: ['--no-install', '@primer/mcp'],
          tools: ['*'],
        })
      },
    },
  ],
}
```

### Configure custom Copilot sub-agents

Treatments can configure custom Copilot sub-agents under `~/.copilot/agents`.
Use `files` when the sub-agent should reference additional local files, folders,
or inline content:

```ts
export const experiment: ExperimentConfig = {
  name: 'Custom agent experiment',
  description: 'Compare behavior with a custom implementation planner',
  models: ['gpt-5.5'],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With custom sub-agent',
      async setup({sandbox}) {
        await sandbox.addCustomAgent('implementation-planner', 'Plans implementation work', 'Create concise plans.', {
          tools: ['read', 'search'],
          files: [
            {
              sourcePath: './docs/planning-guidelines.md',
              destinationPath: 'implementation-planner/guidelines.md',
            },
            {
              path: 'implementation-planner/context.md',
              content: 'Prefer short, actionable implementation plans.',
            },
          ],
        })
      },
    },
  ],
}
```

### Configure Copilot skills

Treatments can also configure Copilot skills under `~/.agents/skills`. Use
`files` when the skill should include additional local files, folders, or inline
content next to `SKILL.md`:

```ts
export const experiment: ExperimentConfig = {
  name: 'Skill experiment',
  description: 'Compare behavior with a planning skill',
  models: ['gpt-5.5'],
  scenarios: ['001-agent-uses-button-from-primer'],
  treatments: [
    {
      name: 'With planning skill',
      async setup({sandbox}) {
        await sandbox.addAgentSkill('planning', 'Plans implementation work', 'Create concise plans.', {
          files: [
            {
              sourcePath: './docs/planning-guidelines.md',
              destinationPath: 'guidelines.md',
            },
            {
              path: 'context.md',
              content: 'Prefer short, actionable implementation plans.',
            },
          ],
        })
      },
    },
  ],
}
```
