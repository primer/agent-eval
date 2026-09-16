# Sandbox

A sandbox is the Docker-backed workspace used for a trial. The harness creates
and disposes containers; configuration hooks receive `sandbox`, so ordinary
benchmark and experiment authors do not need to manage container lifetimes.

The container isolates the task from the host workspace. This is not a reason
to expose secrets or run untrusted fixtures without review: setup hooks run
from host-loaded configuration, package installs execute code, and the agent
has broad command permissions inside the container.

The default runtime provides Node.js, npm, Git, Chromium, and Copilot tooling.
A custom `--docker-image` must be a Debian-based Node image with npm, `apt-get`,
and a `node` user; the harness layers its tools on top.

## Methods

Import public runtime and types from `@primer/agent-eval/sandbox`.

| Method                | Purpose                                                                      |
| :-------------------- | :--------------------------------------------------------------------------- |
| `copy`                | Copy a host file or directory into the container, optionally excluding paths |
| `download`            | Copy a container file or directory to the host                               |
| `readdir`             | List entries in a container directory                                        |
| `readFile`            | Read UTF-8 text in the container                                             |
| `writeFile`           | Write UTF-8 text in the container                                            |
| `exists`              | Check whether a container path exists                                        |
| `runCommand`          | Run a command and capture stdout, stderr, and exit code                      |
| `addAgentInstruction` | Append project-level `AGENTS.md` instructions                                |
| `addAgentSkill`       | Install a skill body and optional supporting files                           |
| `addCustomAgent`      | Install a custom agent with optional files and tools                         |
| `addMcpServer`        | Add an MCP server to the container's Copilot configuration                   |
| `addCopilotPlugin`    | Install a local, remote, or marketplace plugin                               |

See [treatments](treatments.md) for resource installation examples. Consult the
installed TypeScript interface for signatures and supported options.

## Commands and paths

```ts
const result = await sandbox.runCommand('npm', ['run', 'test'], {
  allowNonZeroExitCode: true,
})
if (result.exitCode !== 0) {
  throw new Error(`Tests failed: ${result.stderr}`)
}
```

`runCommand` returns `{stdout, stderr, exitCode}`. By default it rejects a
nonzero exit. Set `allowNonZeroExitCode` only when you will explicitly interpret
the result, such as parsing assertion failures. Other options include `env`
and `user`. Prefer the default `node` user; request `root` only for necessary
system-level setup.

Commands use executable/argument arrays, not implicit shell evaluation.
For shell syntax, explicitly invoke `sh` with `['-c', '...']`.
Each command starts in `/home/sandbox/workspace`; a `cd` in one invocation does
not carry into the next.

Host and container paths are different namespaces. `copy` takes a host source
and container destination; `download` reverses that direction. Container file
operations use workspace-relative paths or container absolute paths. A server's
`localhost` inside the container is not the host's `localhost`.

Keep dependencies pinned and setup reproducible. Do not assume credentials or
host-installed tools automatically exist in a trial container.
