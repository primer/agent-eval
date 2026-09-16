# agent-eval

agent-eval is an open source library for evaluating model performance across
different tasks. This is useful for establishing
[benchmarks](./docs/benchmarks.md) for the capabilities of your project (like a design system) or for running [experiments](./docs/experiments.md) to understand the best way to improve model outcomes for the task at hand.

To learn more about how to use this library, visit [`@primer/agent-eval`](./packages/agent-eval).

## Agent skill

Install the agent-eval skill to help your agent set up and run evaluations:

```sh
npx skills add primer/agent-eval --skill agent-eval
```

The [skill](./skills/agent-eval/SKILL.md) includes a getting-started guide and
references for evaluation methodology, domain models, and the CLI. The skill
and runtime package are installed separately.

## License

Licensed under the [MIT License](./LICENSE).
