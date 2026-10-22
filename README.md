# agent-eval

> An open source library for evaluating model performance across different tasks.

This project contains the [`@primer/agent-eval`](./packages/agent-eval) library and CLI for evaluating agent performance across different tasks. This is useful for establishing
[benchmarks](./docs/benchmarks.md) for the capabilities of your project (like a design system) or for running [experiments](./docs/experiments.md) to understand the best way to improve model outcomes for the task at hand.

To do so, we create a variety of [scenarios](./docs/scenarios.md) that describe the task, the starting workspace, and the checks or judges that evaluate the result. These scenarios are then used in benchmarks and experiments to evaluate model performance.

To learn more about how to use this library, visit [`@primer/agent-eval`](./packages/agent-eval) or install the [agent-eval skill](./skills/agent-eval/SKILL.md) to get started.

## Agent skills

Install the agent-eval skill to help your agent set up and run evaluations:

```sh
npx skills add primer/agent-eval --skill agent-eval
```

The [skill](./skills/agent-eval/SKILL.md) points to the docs included in your
installed `@primer/agent-eval` package, so guidance stays aligned with that
version. The skill and runtime package are installed separately.

You can also skip installing the skill and run `npx agent-eval agent setup`
from your project's root to add this guidance automatically. Or, after
installing the package, add this one line to your project's `AGENTS.md`:

> When working with agent-eval, first read `node_modules/@primer/agent-eval/docs/AGENTS.md`.

The [package docs entrypoint](./packages/agent-eval/docs/AGENTS.md) links to
getting-started, evaluation methodology, domain model, and CLI guides.

Install the [agent-eval-investigate skill](./skills/agent-eval-investigate/SKILL.md)
to investigate experiment or benchmark results, explain observed model behavior
(such as why a tool was or was not called), and suggest setup improvements:

```sh
npx skills add primer/agent-eval --skill agent-eval-investigate
```

Use `/agent-eval-investigate` with a result bundle, the relevant scenario or trial,
and the behavior you want to understand. The skill can also offer to apply a
proposed change and rerun a focused comparison with your approval.

## Contributing

We love collaborating with folks inside and outside of GitHub and welcome contributions! If you're interested, check out our [contributing docs](.github/CONTRIBUTING.md) for more info on how to get started.

## Copilot cloud prototype

This checkout includes an opt-in prototype for running a task with **GitHub-hosted
Copilot cloud agent**, without starting local Docker or Copilot CLI. It is separate
from the published CLI and is **not yet an evaluation runner**.

Use Node.js 26+, install the workspace dependencies, and install a GitHub CLI
version with `gh agent-task` (developed against 2.102.0). Authenticate with
`gh auth login --hostname github.com`; the authenticated account must have
Copilot cloud agent access and access to the target repository.
For this CLI version, use a stored OAuth login, not `GH_TOKEN`, `GITHUB_TOKEN`,
`COPILOT_GITHUB_TOKEN`, or a GitHub Actions installation token. Environment tokens
can override the stored login. The upstream CLI explicitly rejects unsupported
authentication with “this command requires an OAuth token”
([authentication checks](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/agent-task/agent_task.go#L77-L101)).

Prepare a prompt file and a **remote branch** containing the starting workspace.
Local uncommitted files and scenario fixtures are not uploaded. Only submit to a
repository you are authorized to modify: `--submit` creates a remote task, branch,
and pull request and consumes Copilot quota.

```sh
node script/run-cloud-task.ts --submit \
  --repo OWNER/REPO --base evaluation-start \
  --prompt-file ./prompt.txt --output-dir ./results/cloud-01
```

The script polls every 15 seconds and stops locally after one hour by default
(`--timeout-seconds` accepts 1–86400). Timeout, Ctrl+C, or an error does **not**
cancel the remote task, close its PR, or delete its branch. Resume collection
using the UUID saved in `task.json`, always into a fresh output directory:

```sh
node script/run-cloud-task.ts --repo OWNER/REPO \
  --session SESSION_UUID --output-dir ./results/cloud-01-resumed
```

Artifacts include the submission response, session identity and timestamps,
session logs, PR base/head commit IDs, and a diff compared at those immutable
commit IDs. They are local files, not agent-eval result bundles. `error.txt` and
any already-collected evidence remain on failure. Treat logs and diffs as
potentially sensitive; review before sharing.

### Prototype boundaries

- Only `queued` and `in_progress` are polled. Failed, cancelled, timed-out, idle,
  and waiting-for-user sessions stop collection with a nonzero exit status after
  collecting available diagnostics. Unknown states fail rather than imply success.
  Upstream calls `completed` “Ready for review”
  ([state definitions](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/agent-task/shared/display.go#L27-L48));
  it does **not** mean checks passed.
- `gh agent-task create` is a preview interface without JSON output. It can
  return a bare PR URL or queued-job message instead of a session URL
  ([creation behavior](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/agent-task/create/create.go#L175-L242)).
  The script saves that response and stops without retrying submission.
  Find the correct session with `gh agent-task list --json id,repository,state`
  or the Copilot agents page, then use `--session`. Never automatically select
  the newest session or resubmit an ambiguously accepted request.
- Collection captures the PR at collection time, not necessarily the exact tree
  at session completion if someone has since updated the PR. Remote failures,
  unavailable logs, oversized diffs, and transient API errors remain errors;
  collection can be retried by session UUID without creating another task.
- Existing benchmark/experiment runners, setup callbacks, checks, judges,
  walkthroughs, model selection, usage accounting, and local result viewers are
  unchanged. The prototype does not execute or expose held-out graders remotely.
  Ordinary evaluations still require Docker.

This tests the cloud submission/collection boundary first. Full evaluation
support still needs a repository-backed fixture and treatment materialization
strategy, private grading of a pinned resulting commit, cloud-specific result
and usage mapping, and an explicit remote resource cleanup policy. Cloud
sessions are not arbitrary-command sandboxes, so simply adding another runner
value would still leave the existing setup, verification, judging, and capture
stages dependent on Docker.

For more reliable automation, also evaluate the
[public agent tasks REST API](https://docs.github.com/en/rest/agent-tasks/agent-tasks#start-a-task):
its documented `POST /agents/repos/{owner}/{repo}/tasks` returns a structured task
ID. Its entitlement and token requirements differ from `gh agent-task`;
this prototype deliberately uses the CLI surface for session-log collection.

## License

Licensed under the [MIT License](./LICENSE).
