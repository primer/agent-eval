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

This checkout includes an opt-in, repository-only prototype that runs the **entire
existing evaluation harness inside a GitHub Copilot cloud session**. Your machine
only submits and collects: no local Docker or local model calls are required.
Remote Docker is still required. Published APIs, Docker runners, and ordinary
CLI behavior are unchanged.

The outer cloud agent receives a fixed orchestration prompt, not the scenario
task. It invokes the committed remote entrypoint, which installs dependencies,
builds the existing CLI, and runs `benchmark run`, `experiment run`, or
`scenario run` with a normal output directory. That CLI performs the usual Docker
image builds, setup, inner agent execution, checks, judges, walkthrough, and
artifact saving specified by the selected configuration. The outer agent is told
not to solve scenarios, edit configurations, or retry runs.

### Prerequisites and trust

Use Node.js 26+, install the workspace dependencies, and install a GitHub CLI
version with `gh agent-task` (developed against 2.102.0). Authenticate with
`gh auth login --hostname github.com`; the authenticated account must have
Copilot cloud agent access and access to the target repository.
For this CLI version, use a stored OAuth login, not `GH_TOKEN`, `GITHUB_TOKEN`,
`COPILOT_GITHUB_TOKEN`, or a GitHub Actions installation token. Environment tokens
can override the stored login. The upstream CLI explicitly rejects unsupported
authentication with “this command requires an OAuth token”
([authentication checks](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/agent-task/agent_task.go#L77-L101)).

Use a target repository and a remote branch containing this prototype
and the trusted benchmark, experiment, or scenario definition and all its files.
Local uncommitted files are not uploaded. Select an existing definition by its
filename/directory ID; arbitrary prompts, paths, and shell commands are not
accepted. Configurations execute code: review the entire selected configuration,
dependencies, setup callbacks, and grading code before granting access to tokens.

Configure repository **Settings → Secrets and variables → Agents** with these
[Agents secrets](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/configure-secrets-and-variables#configuring-repository-level-secrets-and-variables).
GitHub documents that configured secrets “are exposed to Copilot as environment
variables”; older `copilot` environment secrets have been migrated to Agents:

- `COPILOT_GITHUB_TOKEN`: your explicitly supplied token authorized for the inner
  Copilot CLI/model calls, including judges. The prototype does not reuse
  undocumented internal cloud-agent authentication.
- `CLOUD_EVAL_GITHUB_TOKEN`: a separate user-provided token restricted to this
  target repository with **Contents: write**, used only for durable release-asset
  export. Do not put either token in the request, configuration files, or prompts.

The uploader token is injected only into storage-related `gh` commands.
Inner evaluation processes have `CLOUD_EVAL_GITHUB_TOKEN`, `GH_TOKEN`, and
`GITHUB_TOKEN` removed and receive the explicit `COPILOT_GITHUB_TOKEN` instead.
This does not hide secrets from the outer cloud agent: it can access configured
Agents secrets and must be trusted.

Provision Linux with Node.js 26+, this checkout's pnpm version, GitHub CLI, GNU
tar, a working Docker daemon, and installed workspace dependencies
(`pnpm install --frozen-lockfile`) in the cloud environment. Dependencies must
already be present to load the TypeScript entrypoint; it rechecks the frozen
installation before building. Use
[`copilot-setup-steps.yml`](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment#customizing-copilots-development-environment-with-copilot-setup-steps)
on the default branch when provisioning is needed. Allow the network destinations
required by package installation, image pulls, model calls, and GitHub release
uploads. The entrypoint fails rather than asking the outer agent to fix missing
tools or modify the evaluation. It verifies the checkout repository and exact
source tree pinned from the base commit before executing the harness.

Create an empty **draft release** in that same repository separately,
then pass its existing tag with `--results-release`. This prototype never creates
a release and rejects cross-repository or published releases before costly
evaluation work. It pins both the exact supplied tag and the release database ID
in the saved request; deleting and recreating the tag's release fails validation.
[GitHub's release visibility documentation](https://docs.github.com/en/rest/releases/releases#list-releases)
states: “Information about published releases are available to everyone. Only
users with push access will receive listings for draft releases.”
This permits draft storage in public repositories, but it is interim, restricted
storage, **not permanently private storage**: publishing the release in a public
repository makes its assets public.
Keep it draft and restrict writer access. The script rechecks draft status before
each upload/download, but cannot prevent someone publishing it between that
check and the transfer, or afterward.

### Submit and collect

Submission creates a remote task, branch, and PR and consumes cloud-agent and
inner model quota. Submit only to a repository you are authorized to modify:

```sh
node script/run-cloud-task.ts --submit \
  --repo OWNER/REPO --base evaluation-start \
  --kind scenario --name 001-example \
  --results-release cloud-evaluation-results \
  --export-bundle --output-dir ./results/cloud-01
```

Use `--kind benchmark` or `--kind experiment` for those definitions. The explicit
`--export-bundle` flag authorizes uploading the **full, potentially sensitive**
normal result bundle. It can contain private scenario source, workspace changes,
saved `.copilot` configuration and transcripts, credentials, judge information,
and screenshots/video. Only use this flag when that entire bundle is approved
for storage in the draft release and its potential future visibility. Before
archiving, export rejects symlinks, hardlinks, special files, and files containing
known environment credential values (credential-bearing name suffixes such as
`_TOKEN` or `_API_KEY`, with values of at least 16 characters after trimming).
Feature flags and secret-name metadata are excluded. This scan is **not general secret detection or
redaction**: short, unknown, encoded, or transformed credentials and confidential source
can still be present. It also cannot secure files against concurrent modification
between inspection and archiving. Full bundles require your explicit review and
consent.
Without the flag, only structured execution status leaves the session; the full
normal bundle is still saved remotely, but is not durably collected.

The script generates a unique run UUID, records the base commit, its tree ID, and request,
polls every 15 seconds, and stops locally after one hour by default.
`--timeout-seconds` accepts 1–86400 and also sets an absolute remote deadline at
submission time, including queue time. The remote process group is killed on its
deadline, first with SIGTERM to let the existing harness attempt
[cleanup of its tracked containers](./packages/agent-eval/src/docker.ts#L186-L205),
then with SIGKILL after a five-second grace period. Export
has a separate two-minute grace period. Cloud-session expiry or
hard termination can still prevent export.

Local timeout, Ctrl+C, or an error does **not** cancel the remote session, close
its PR, or delete its branch. Resume **collection only**, preserving the original
run identity and deadline, into a fresh output directory:

```sh
node script/run-cloud-task.ts \
  --task-file ./results/cloud-01/task.json \
  --output-dir ./results/cloud-01-resumed
```

### Durable results and failure handling

The full normal bundle stays in `results/cloud/RUN_UUID/bundle` in the session.
The remote entrypoint first writes structured execution status, then uploads
`RUN_UUID.execution.json` and, only with explicit consent, `RUN_UUID.tar.gz`
using `gh release upload`. Names are unique to the run, with no `--clobber`.
The collector separately downloads release assets with `gh release download`,
checks the status against the complete original request, and **never extracts**
the archive. `collection.json` binds that request and run UUID, the verified
session UUID, and the execution receipt. This is local correlation metadata, not
service-attested proof that the receipt originated in that session: the session
UUID is not known when the submission prompt is generated. The receipt records
the actual execution HEAD commit, source tree ID, output manifest SHA-256, and
nonzero trial count.
Review archive contents in an isolated location before using the
normal result viewer. Filesystem paths inside the ordinary result JSON still
refer to the remote bundle location.

These are real release assets, not `.gitignored` files supposedly downloadable
from a PR. No Actions artifact runtime credentials are assumed. Raw shell logs,
environment files, or the repository checkout are not added to the upload; the
opted-in full harness bundle may itself contain logs and configuration. The local
collector uses your GitHub CLI login and needs writer access to the draft release.
Manage asset retention and deletion yourself; do not publish the storage release.

Submission response, resumable request/session identity, raw session metadata,
execution status, downloaded assets, and `error.txt` are retained locally as
available, even on failure. The prototype does not automatically download outer
session logs or PR diffs. A completed cloud session is **not** a successful
evaluation: success additionally requires a matching, successful execution status
and the requested assets. Harness failure/timeout, export failure, missing assets,
malformed metadata, and failed/cancelled cloud sessions cause a nonzero local exit.
Execution success requires the existing CLI to exit successfully and produce a
parseable output manifest with at least one trial (and matching per-trial output
files for benchmarks/experiments). It does not mean every scenario check passed;
inspect the normal result JSON for evaluation outcomes.

### Prototype boundaries

- Only `queued` and `in_progress` are polled. Failed, cancelled, timed-out, idle,
  and waiting-for-user sessions stop collection with a nonzero exit status after
  attempting release collection. Unknown states fail rather than imply success.
  Upstream calls `completed` “Ready for review”
  ([state definitions](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/agent-task/shared/display.go#L27-L48));
  it does **not** mean checks passed.
- `gh agent-task create` is a preview interface without JSON output. It can
  return a bare PR URL or queued-job message instead of a session URL
  ([creation behavior](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/agent-task/create/create.go#L175-L242)).
  The script saves that response and stops without retrying submission.
  Find and verify the correct session with
  `gh agent-task list --json id,repository,state` or the Copilot agents page, then
  use `--task-file ./results/cloud-01/request.json --session SESSION_UUID`.
  Never automatically choose the newest session or resubmit an ambiguously
  accepted request. An exclusive per-run remote directory prevents local retries
  of the same entrypoint; it is not a distributed exactly-once guarantee.
- The checkout must retain the exact pinned source tree and have no tracked
  source edits. Metadata-only wrapper commits with an unchanged tree are allowed;
  the actual HEAD is recorded separately from the requested base commit. Outer-agent prompt
  compliance is not a security boundary. All evaluation code and graders are
  visible to the outer session; this is not held-out/private grading.
- There has been no live end-to-end cloud/model/upload verification or performance
  measurement. Cloud entitlement, Docker/network availability, token permissions,
  asset limits, and session lifetime must be verified in your environment. A
  failed export retains local remote files only for the session's lifetime.
  Killing a harness process on deadline does not guarantee Docker-daemon resource
  cleanup; use ephemeral cloud hosts and inspect failed runs before host disposal.

## License

Licensed under the [MIT License](./LICENSE).
