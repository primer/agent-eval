# Sandbox

A sandbox is a wrapper around a docker container that allows you to run code in
a sandboxed environment. This helps to prevent the agent from accessing the host machine and allows you to control what the agent has access to.

The sandbox is used in [experiments](./experiments.md) and [benchmarks](./benchmarks.md) to provide a consistent environment for the agent to run in.

The [`Sandbox` interface](../packages/agent-eval/src/sandbox/types.ts) provides the following methods:

| Method                | Description                                                                   |
| :-------------------- | :---------------------------------------------------------------------------- |
| `copy`                | Copies a host file or directory into the sandbox                              |
| `download`            | Downloads a file or directory from the sandbox to the host                    |
| `readdir`             | Lists the files and directories in a sandbox directory.                       |
| `glob`                | Finds sandbox paths using glob patterns and options.                          |
| `readFile`            | Reads a UTF-8 file from the sandbox.                                          |
| `writeFile`           | Writes a UTF-8 file to the sandbox.                                           |
| `exists`              | Checks whether a file or directory exists in the sandbox.                     |
| `runCommand`          | Runs a command and returns its standard output, standard error, and exit code |
| `addAgentInstruction` | Appends instructions to the sandbox's project-level `AGENTS.md` file.         |
| `addAgentSkill`       | Adds an agent skill, with optional supporting files.                          |
| `addCustomAgent`      | Adds a custom agent, with optional supporting files and tools.                |
| `addMcpServer`        | Adds an MCP server to the sandbox's Copilot configuration.                    |
| `addCopilotPlugin`    | Installs a remote, local, or marketplace Copilot plugin in the sandbox.       |

## Finding files

Use `sandbox.glob(pattern, options?)` in setup or check hooks to find files.
It accepts the patterns and options of the npm [`glob`](https://www.npmjs.com/package/glob)
library's asynchronous `glob()` function, including an array of patterns.

```ts
const files = await sandbox.glob('src/**/*.{ts,tsx}', {
  ignore: ['**/*.test.ts'],
  nodir: true,
})
for (const file of files) {
  const contents = await sandbox.readFile(file)
}
```

The default `cwd` is `/home/sandbox/workspace`. A relative `cwd` is resolved
against that workspace; absolute paths and file URLs refer to the sandbox
filesystem. Results are relative to `cwd` unless `absolute: true` is set or the
pattern is absolute. With a custom `cwd`, use `absolute: true` when passing
matches to other sandbox file methods.

`withFileTypes: true` returns glob `Path` objects instead of strings. Their
asynchronous filesystem methods use the sandbox; synchronous filesystem methods
are not supported. Glob searches work in Docker and virtual sandboxes without
installing the glob package in the scenario.
