# agent-eval

> An open source library for evaluating model performance across different tasks.

This project contains the [`@primer/agent-eval`](./packages/agent-eval) library and CLI for evaluating agent performance across different tasks. This is useful for establishing
[benchmarks](./docs/benchmarks.md) for the capabilities of your project (like a design system) or for running [experiments](./docs/experiments.md) to understand the best way to improve model outcomes for the task at hand.

To do so, we create a variety of [scenarios](./docs/scenarios.md) that describe the task, the starting workspace, and the checks or judges that evaluate the result. These scenarios are then used in benchmarks and experiments to evaluate model performance.

To learn more about how to use this library, visit [`@primer/agent-eval`](./packages/agent-eval) or install the [agent-eval skill](./skills/agent-eval/SKILL.md) to get started.

## Agent skill

Install the agent-eval skill to help your agent set up and run evaluations:

```sh
npx skills add primer/agent-eval --skill agent-eval
```

The [skill](./skills/agent-eval/SKILL.md) includes a getting-started guide and
references for evaluation methodology, domain models, and the CLI. The skill
and runtime package are installed separately.

## Contributing

We love collaborating with folks inside and outside of GitHub and welcome contributions! If you're interested, check out our [contributing docs](.github/CONTRIBUTING.md) for more info on how to get started.

## License

Licensed under the [MIT License](./LICENSE).
