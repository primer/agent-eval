# Models and runners

**Use when:** selecting models, reasoning effort, or implementation backends.
A model variant is one model/effort pair; a runner is a separate dimension.

## Contract

| Location                            | Shape or default                                     |
| :---------------------------------- | :--------------------------------------------------- |
| Benchmark/experiment `models`       | Model strings or `{name, reasoningEfforts?}` objects |
| Omitted or empty `reasoningEfforts` | One variant with `medium` effort                     |
| Model string                        | One variant with `medium` effort                     |
| Judge `model`                       | `{name, reasoningEffort}` (singular)                 |
| Experiment `runners`                | `copilot-cli`, `copilot-sdk`, or both                |
| Default implementation runner       | `copilot-cli`                                        |
| Standalone `scenario run` model     | Currently `gpt-5.6-luna`, `low`                      |

Model names and allowed efforts must be supported by the installed package
**and** authorized for the token. Check configuration types or
[upstream model definitions](https://github.com/primer/agent-eval/blob/main/packages/agent-eval/src/model.ts);
do not assume arbitrary Copilot model names are accepted.

The registry includes `claude-fable-5`, `claude-fable-5.1`, and `gpt-6-astra`,
each with `low`, `medium`, `high`, `xhigh`, and `max` reasoning efforts.
Omitting effort still selects `medium`, not the provider's default.
The default sandbox installs Copilot CLI 1.0.85, which adds GPT-6 Astra support.
Fable access requires administrative enablement and is subject to Anthropic's
data-retention requirements; review
[GitHub's model availability and access notes](https://docs.github.com/en/copilot/reference/ai-models/supported-models)
before running evaluations.

There is no `--model` flag. Use an experiment with one model variant when model
selection matters. Judge and walkthrough sessions use the CLI even when
implementation uses the SDK.

## Configuration fragments

Insert this property into a benchmark or experiment configuration:

```ts
models: ['gpt-5.4', {name: 'gpt-5.4', reasoningEfforts: ['low', 'high']}]
```

This expands to three variants: `medium` from the string, then `low` and `high`.
For a quick run, use only one explicit effort.

Inside a judge definition, use a resolved variant instead:

```ts
model: {name: 'gpt-5.4', reasoningEffort: 'low'}
```

Note singular `reasoningEffort` for a judge versus plural `reasoningEfforts`
in benchmark/experiment model configuration. A judge does not accept a bare
model string.

## Run

For a new run or plan, `--runner` selects one runner and overrides an
experiment's runner dimension. For `plan run`, it **filters existing trials**;
it does not rewrite their runner or create missing combinations. Shard
assignment happens before this filter.

For an existing benchmark `baseline` or experiment `comparison`, select a
runner through the CLI. These are command templates; substitute your config ID:

```sh
npx agent-eval benchmark run baseline --runner copilot-sdk
npx agent-eval experiment plan create comparison --runner copilot-sdk --output-path sdk-plan.json
```

## Verify

Inspect plan trials for the exact model names, efforts, and runners intended.
After execution, confirm those dimensions in trial results before comparing
conditions. Verify that runner filtering selected trials rather than assuming
it created new combinations.

## Pitfalls

`runners: ['copilot-cli', 'copilot-sdk']` multiplies an experiment's trial count.
Keep runner groups separate when interpreting results. Older plans without a
runner default to the CLI; create a new plan to add a runner missing from an
existing plan.
