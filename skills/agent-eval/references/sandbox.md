# Sandbox

**Use when:** installing trial resources, running commands, or moving files
between the host and a trial's Docker workspace.

## Contract

| Item                      | Rule                                              |
| :------------------------ | :------------------------------------------------ |
| Access                    | Use the `sandbox` supplied to setup/check hooks   |
| Lifecycle                 | The harness creates and disposes trial containers |
| Default user              | `node`                                            |
| Command working directory | `/home/sandbox/workspace`                         |
| Command result            | `{stdout, stderr, exitCode}`                      |
| Nonzero exit              | Rejects unless `allowNonZeroExitCode: true`       |

The container isolates the task from the host workspace. This is not a reason
to expose secrets or run untrusted fixtures without review: setup hooks run
from host-loaded configuration, package installs execute code, and the agent
has broad command permissions inside the container.

The default runtime provides Node.js, npm, Git, Chromium, and Copilot tooling.
A custom `--docker-image` must be a Debian-based Node image with npm, `apt-get`,
and a `node` user; the harness layers its tools on top.

## Methods

Use the sandbox supplied to hooks; its runtime implementations are internal.

| Method                | Purpose                                                                      |
| :-------------------- | :--------------------------------------------------------------------------- |
| `copy`                | Copy a host file or directory into the container, optionally excluding paths |
| `download`            | Copy a container file or directory to the host                               |
| `readdir`             | List entries in a container directory                                        |
| `glob`                | Find sandbox paths using npm glob patterns and options                       |
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

## Finding files

`sandbox.glob(pattern, options?)` uses the npm `glob` library's asynchronous API.
Patterns can be a string or array of strings; options include `ignore`, `dot`,
`nodir`, `absolute`, and `withFileTypes`.

```ts
const files = await sandbox.glob('src/**/*.{ts,tsx}', {
  nodir: true,
  ignore: ['**/*.test.ts'],
})
```

The default `cwd` is `/home/sandbox/workspace`; relative `cwd` values resolve
against that directory. Absolute paths and file URLs refer to the sandbox.
Matches are relative to `cwd` by default. With a custom `cwd`, use
`absolute: true` to pass matches directly to `sandbox.readFile`.
`withFileTypes: true` returns glob `Path` objects; use their asynchronous
filesystem methods, not the synchronous methods. No scenario dependency is needed.

## Command fragment

For a fixture that defines an npm `test` script, this fragment can run inside a
setup or check hook. It demonstrates command handling, not a complete check:

```ts
const result = await sandbox.runCommand('npm', ['run', 'test'], {
  allowNonZeroExitCode: true,
})
if (result.exitCode !== 0) {
  throw new Error(`Tests failed: ${result.stderr}`)
}
```

Set `allowNonZeroExitCode` only when you will explicitly interpret
the result, such as parsing assertion failures. Other options include `env`
and `user`. Prefer the default `node` user; request `root` only for necessary
system-level setup.

## Run and verify

Run the enclosing scenario, benchmark, or experiment. Inspect command errors
and saved artifacts to confirm setup produced the intended environment.
Resource-specific verification is covered in [treatments](treatments.md).

## Pitfalls

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
