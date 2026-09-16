# Models and runners

A **model variant** is a model name plus one reasoning effort. A **runner** is
the backend used for the implementation task. They are separate dimensions.

## Model configuration

Benchmarks and experiments accept strings or model objects:

```ts
models: ['gpt-5.4', {name: 'gpt-5.4', reasoningEfforts: ['low', 'high']}]
```

This expands to three variants: `medium` from the string, then `low` and `high`.
An omitted or empty `reasoningEfforts` array also defaults to `medium`.
For a quick run, use only one explicit effort.

Model names and allowed efforts are validated against the package's supported
list. Consult installed configuration types or
[the upstream model definitions](https://github.com/primer/agent-eval/blob/main/packages/agent-eval/src/model.ts);
do not assume arbitrary Copilot model names or efforts are accepted.
Package support does not guarantee your token has access to that model.

Judge configuration uses a resolved variant:

```ts
model: {name: 'gpt-5.4', reasoningEffort: 'low'}
```

Note singular `reasoningEffort` for a judge versus plural `reasoningEfforts`
in benchmark/experiment model configuration. A judge does not accept a bare
model string.

Standalone `scenario run` currently uses `gpt-5.6-luna` with `low` effort.
It has no `--model` flag. Use an experiment with one model variant when model
selection matters.

## Runners

The supported implementation runners are `copilot-cli` and `copilot-sdk`.
The default is `copilot-cli`.

Experiments may define `runners: ['copilot-cli', 'copilot-sdk']`. Benchmarks and
standalone scenarios select one runner via the CLI:

```sh
npx agent-eval benchmark run baseline --runner copilot-sdk
npx agent-eval experiment plan create comparison --runner copilot-sdk --output-path sdk-plan.json
```

For a new run or plan, `--runner` selects one runner and overrides an
experiment's runner dimension. For `plan run`, it **filters existing trials**;
it does not rewrite their runner or create missing combinations. Shard
assignment happens before this filter.

Runner selection only affects implementation. Judges and walkthrough capture
continue to use the Copilot CLI. Plans and results record the implementation
runner; older plans without one default to the CLI. Keep runner groups separate
when interpreting results.
