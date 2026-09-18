# Sandbox

A sandbox is a wrapper around a docker container that allows you to run code in
a sandboxed environment. This helps to prevent the agent from accessing the host machine and allows you to control what the agent has access to.

The sandbox is used in [experiments](./experiments.md) and [benchmarks](./benchmarks.md) to provide a consistent environment for the agent to run in.

## Sandbox images

By default, Agent Eval builds its sandbox image from `dockerImage`. For
controlled runs that prepare the complete runtime image ahead of time, pass
`preparedImage` instead. A prepared image must already exist in the local
Docker daemon and must use an immutable reference:

- a local image ID such as `sha256:<64 hexadecimal characters>`; or
- a repository digest such as
  `ghcr.io/example/eval-runtime@sha256:<64 hexadecimal characters>`.

Mutable tags such as `node:latest` are rejected for `preparedImage`.
`preparedImage` and `dockerImage` are mutually exclusive. Agent Eval verifies
that a prepared image exists locally and uses it directly without rebuilding or
pulling it.

Sandbox archive downloads are limited to 30 seconds. Container removal is
limited to five seconds and receives an abort signal when that deadline is
reached.

`download` accepts an optional complete-file transform that runs before any
file is written to the host. Agent Eval uses this boundary to redact exact
credential values from retained trial evidence. Archive paths are constrained
to the requested destination, and extraction through symbolic-link ancestors
is rejected.

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
