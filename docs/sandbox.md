# Sandbox

A sandbox is a wrapper around a docker container that allows you to run code in
a sandboxed environment. This helps to prevent the agent from accessing the host machine and allows you to control what the agent has access to.

The sandbox is used in [experiments](./experiments.md) and [benchmarks](./benchmarks.md) to provide a consistent environment for the agent to run in.

Container disposal force-removes the container with a 30-second deadline. If
Docker does not confirm removal in time, cleanup is reported as an infrastructure
error. Cancelling the request does not guarantee that Docker stopped processing it
or that the container was removed. Cleanup retries up to three times without
rerunning a completed trial.

Trials can proceed while prior containers are being removed. Cleanup concurrency
matches `--container-concurrency`, and the total budget for running, queued for
cleanup, and unresolved containers is twice that value. Admission waits when the
budget is full. If cleanup exhausts its retries, new container admission stops;
already-started trials finish and their results are saved before the CLI reports
an infrastructure error.

## Recovering leftover containers

Each run logs its UUID and writes `run-<id>.json` into its output directory.
After the owning evaluation process exits, recover its leftover containers with:

```sh
npx agent-eval container clean --run-id <run-uuid>
```

Run recovery from the same host, user, and process namespace used for evaluation,
against the same Docker daemon. It only targets containers labelled for that
host/user and exact run, and removes them only when the owning PID is confirmed
absent. Live, permission-inaccessible, or reused PIDs are skipped. Containers
from older releases without ownership labels are not targeted.

Explicit removal is the primary cleanup mechanism; Docker's auto-removal is a
fallback. Recovery does not prune images, unrelated containers, or volumes.

The [`Sandbox` interface](../packages/agent-eval/src/sandbox/types.ts) provides the following methods:

| Method                | Description                                                                            |
| :-------------------- | :------------------------------------------------------------------------------------- |
| `copy`                | Copies a host file or directory into the sandbox                                       |
| `download`            | Downloads a file or directory from the sandbox to the host                             |
| `readdir`             | Lists the files and directories in a sandbox directory.                                |
| `readFile`            | Reads a UTF-8 file from the sandbox.                                                   |
| `writeFile`           | Writes a UTF-8 file to the sandbox.                                                    |
| `exists`              | Checks whether a file or directory exists in the sandbox.                              |
| `runCommand`          | Runs a command with a deadline and optional cancellation; returns output and exit code |
| `addAgentInstruction` | Appends instructions to the sandbox's project-level `AGENTS.md` file.                  |
| `addAgentSkill`       | Adds an agent skill, with optional supporting files.                                   |
| `addCustomAgent`      | Adds a custom agent, with optional supporting files and tools.                         |
| `addMcpServer`        | Adds an MCP server to the sandbox's Copilot configuration.                             |
| `addCopilotPlugin`    | Installs a remote, local, or marketplace Copilot plugin in the sandbox.                |

## Command deadlines

Commands have a one-hour default deadline covering Docker exec creation, startup,
output streaming, and exit-status inspection. Pass a positive integer `timeoutMs`
in milliseconds (at most 2,147,483,647) or an `AbortSignal` through `signal`:

```ts
const result = await sandbox.runCommand('npm', ['test'], {
  timeoutMs: 120_000,
  signal: controller.signal,
  allowNonZeroExitCode: true,
})
```

Timeouts, cancellation after execution starts, and uncertain stream failures
reject even with `allowNonZeroExitCode: true`. They retire the whole container
and request forced removal, since closing an exec connection does not stop its
processes. Do not catch these errors and reuse the sandbox. Cleanup has its own
deadline and may remain unresolved. Pre-aborted signals and invalid options
reject without starting a command or retiring the sandbox.
