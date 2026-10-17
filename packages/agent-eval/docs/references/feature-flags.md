# Feature flags

**Use when:** enabling an unstable feature or checking available flags and their defaults.

Feature flags control access to unstable features. These features may change or
be removed; do not treat them as stable APIs.

## Configure flags

Set `AGENT_EVAL_FEATURE_FLAGS` before starting agent-eval. Its value is a
comma-separated list of flag names:

- A flag name enables that feature.
- Prefix a flag name with `!` to disable it.
- Unspecified flags keep their defaults.
- If a flag appears more than once, the last value wins.
- Unknown flag names cause a startup error.

For example, enable the unstable UI:

```sh
AGENT_EVAL_FEATURE_FLAGS=ui-command npx agent-eval ui
```

To explicitly disable it:

```sh
AGENT_EVAL_FEATURE_FLAGS='!ui-command' npx agent-eval --help
```

## Available flags

| Flag         | Default  | Effect                                                                                                        |
| :----------- | :------- | :------------------------------------------------------------------------------------------------------------ |
| `ui-command` | Disabled | Enables the unstable `ui` command and its subcommands, including `ui build`. See [Local UI](cli.md#local-ui). |
