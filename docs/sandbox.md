# Sandbox

A sandbox is a wrapper around a docker container that allows you to run code in
a sandboxed environment. This helps to prevent the agent from accessing the host machine and allows you to control what the agent has access to.

The sandbox is used in [experiments](./experiments.md) and [benchmarks](./benchmarks.md) to provide a consistent environment for the agent to run in.

Every trial starts from a prepared scenario image. Ordinary scenarios use an
automatically generated image; a scenario can instead provide its own image or
Dockerfile. See [scenario images](./scenarios.md#generated-images-and-prebuilding)
for prebuilding with the CLI or `buildScenarioImage`.

For direct sandbox use, `SystemSandbox.buildImage(options)` builds the runtime
image without starting a container. Pass the returned reference to
`SystemSandbox.create({preparedImage: image})` to use it without rebuilding.
`preparedImage` cannot be combined with other image build options.

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
