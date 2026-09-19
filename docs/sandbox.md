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

The [`Sandbox` interface](../packages/agent-eval/src/sandbox/types.ts) provides the following methods:

| Method                | Description                                                                   |
| :-------------------- | :---------------------------------------------------------------------------- |
| `copy`                | Copies a host file or directory into the sandbox                              |
| `download`            | Downloads a file or directory from the sandbox to the host                    |
| `readdir`             | Lists the files and directories in a sandbox directory.                       |
| `readFile`            | Reads a UTF-8 file from the sandbox.                                          |
| `writeFile`           | Writes a UTF-8 file to the sandbox.                                           |
| `exists`              | Checks whether a file or directory exists in the sandbox.                     |
| `runCommand`          | Runs a command and returns its standard output, standard error, and exit code |
| `addAgentInstruction` | Appends instructions to the sandbox's project-level `AGENTS.md` file.         |
| `addAgentSkill`       | Adds an agent skill, with optional supporting files.                          |
| `addCustomAgent`      | Adds a custom agent, with optional supporting files and tools.                |
| `addMcpServer`        | Adds an MCP server to the sandbox's Copilot configuration.                    |
| `addCopilotPlugin`    | Installs a remote, local, or marketplace Copilot plugin in the sandbox.       |
