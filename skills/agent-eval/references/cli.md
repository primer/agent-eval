# CLI

**Use when:** selecting a command, checking flags, or diagnosing execution errors.

## Contract

Run from your evaluation project's root with `npx agent-eval`. Names are
configuration filenames without extensions for benchmarks/experiments and
folder names for scenarios, not display names or paths to `.ts` files.
Use a fresh output directory per run. Execution requires Docker and
`COPILOT_GITHUB_TOKEN` or `--token`; planning and merge do not require a token.

## Commands

| Command                         | Purpose                         |
| :------------------------------ | :------------------------------ |
| `benchmark run <name>`          | Run a benchmark directly        |
| `benchmark plan create <name>`  | Write a benchmark plan          |
| `benchmark plan run`            | Execute a saved benchmark plan  |
| `benchmark merge`               | Merge benchmark shard results   |
| `experiment run <name>`         | Run an experiment directly      |
| `experiment plan create <name>` | Write an experiment plan        |
| `experiment plan run`           | Execute a saved experiment plan |
| `experiment merge`              | Merge experiment shard results  |
| `scenario run <name>`           | Run one scenario                |

Use singular `benchmark`, `experiment`, and `scenario`. There is no CLI
scaffolding command; create files with the appropriate `defineConfig` helper.
Do not use legacy top-level `--experiment`, `--output`, or `--artifacts` flags.

```sh
npx agent-eval --help
npx agent-eval experiment run --help
npx agent-eval benchmark plan create --help
npx agent-eval scenario run --help
```

## Options by scope

| Option                            | Scope and default                                 |
| :-------------------------------- | :------------------------------------------------ |
| `--benchmarks <dir>`              | Benchmark run and plan commands; `./benchmarks`   |
| `--experiments <dir>`             | Experiment run and plan commands; `./experiments` |
| `--scenarios <dir>`               | Run and plan commands; `./scenarios`              |
| `--output-dir <dir>`              | Run, plan run, and merge; `./results`             |
| `--output-path <file>`            | Plan create only; `plan.json`                     |
| `--plan-path <file>`              | Plan run only; `./plan.json`                      |
| `--shard <order>/<total>`         | Plan run only; omitted means all trials           |
| `--runner <runner>`               | Run, plan create, plan run; see below             |
| `--check <name>`                  | Scenario run only; selects one configured check   |
| `--copilot-concurrency <n>`, `-c` | Run and plan run; `1`                             |
| `--container-concurrency <n>`     | Run and plan run; `5`                             |
| `--docker-image <image>`          | Run and plan run; package default Node image      |
| `--token <token>`                 | Run and plan run; prefer `COPILOT_GITHUB_TOKEN`   |
| `--log-level <level>`             | Root option; `info`                               |

Concurrency values must be positive integers. Copilot concurrency limits active
sessions; container concurrency limits active trial containers. Both apply per
process, so sharding multiplies the aggregate limits. Start small.

`--runner` accepts `copilot-cli` or `copilot-sdk`. It overrides the runner
dimension on new runs/plans but only filters trials in an existing plan.
There is no `--model` or `--repeat` option; configure model variants and repeat
commands with unique output directories.

The CLI requires `--token` or `COPILOT_GITHUB_TOKEN` for execution. Host Copilot
login alone does not satisfy this check. Plan creation and merge do not require
a token. Avoid putting token values on command lines, in logs, or in shell
history.

## Command templates

These are independent examples, not a sequence to execute unchanged. Substitute
existing configuration IDs and paths. The shard command executes only `1/2`;
collect all expected shards and artifacts before using merge, which overwrites
the combined output and removes shard manifests.

```sh
npx agent-eval experiment run comparison --output-dir ./results/comparison-01
npx agent-eval benchmark plan create baseline --output-path ./baseline-plan.json
npx agent-eval benchmark plan run --plan-path ./baseline-plan.json --shard 1/2 --output-dir ./results/baseline-01
npx agent-eval benchmark merge --output-dir ./results/baseline-01
```

See [plans](plans.md) for the complete workflow or
[getting started](getting-started.md) for commands tied to a runnable fixture.

## Verify

Match the requested command against installed `--help`. After planning, inspect
trial combinations. After execution, read trial-level results rather than
inferring quality from exit status. After merge, confirm coverage against the
intended plan and verify all result paths resolve.

## Troubleshooting

| Symptom                           | Check                                                                                                                |
| :-------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| Configuration not found           | Filename ID, working directory, directory flags, export name, and earlier schema warnings                            |
| Scenario missing                  | Both `package.json` and `scenario.config.ts` exist in the selected scenario directory                                |
| Config import fails               | Host dependency installation, Node version, import paths, and unresolved `workspace:*` references                    |
| Docker connection fails           | Docker daemon is running and accessible to the current user                                                          |
| Dependency/setup failure          | Fixture installs with npm independently; pinned packages and endpoints are reachable inside Docker                   |
| Build fails before implementation | Starting fixture is buildable; setup did not break it                                                                |
| Token missing or access denied    | Runtime token is supplied and authorized for Copilot and selected models                                             |
| Unsupported model/effort          | Installed package's model types, not a guessed provider model name                                                   |
| Check throws or reports no tests  | Private files were listed, test dependencies exist, reporter writes the expected file, and config includes the tests |
| Checks fail but command completed | Read trial outcomes; command completion is not a quality pass                                                        |
| Judge error                       | Valid report, configured score, accessible evidence, and judge model access                                          |
| Merge fails                       | Every referenced trial file and artifact directory was collected with consistent paths and IDs                       |

Inspect failures before rerunning. Keep infrastructure failures separate from
treatment results. Never silently substitute an empty grader, remove a failing
criterion, or count an incomplete run as success.
