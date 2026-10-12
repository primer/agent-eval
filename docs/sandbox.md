# Sandbox

A sandbox is a wrapper around a docker container that allows you to run code in
a sandboxed environment. This helps to prevent the agent from accessing the host machine and allows you to control what the agent has access to.

The sandbox is used in [experiments](./experiments.md) and [benchmarks](./benchmarks.md) to provide a consistent environment for the agent to run in.

The [`Sandbox` interface](../packages/agent-eval/src/sandbox/types.ts) provides the following methods:

| Method                | Description                                                                   |
| :-------------------- | :---------------------------------------------------------------------------- |
| `copy`                | Copies a host file or directory into the sandbox                              |
| `download`            | Downloads a file or directory from the sandbox to the host                    |
| `glob`                | Matches file and directory paths in the sandbox.                              |
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

Use `sandbox.glob(pattern, options)` to search the sandbox filesystem. Patterns
and `cwd` are workspace-relative by default; absolute paths refer to the
sandbox, not the host. Pass a string or an array of patterns and optional
glob options such as `ignore`, `nodir`, `dot`, or `absolute`. Matching is
case-sensitive by default, and result ordering is unspecified. Options must be
serializable: `ignore` accepts a string or array of patterns, not callbacks.
`AbortSignal` is not supported.
