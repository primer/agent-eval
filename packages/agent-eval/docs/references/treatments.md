# Treatments

**Use when:** changing the knowledge or tools available to the implementation
agent without changing its task or grader.

## Contract

| Item           | Rule                                                           |
| :------------- | :------------------------------------------------------------- |
| Required field | Unique `name`; `Control` is reserved                           |
| Optional field | `async setup({sandbox})`                                       |
| Identity       | Name-derived ID; keep names stable when reusing plans          |
| Setup API      | Use the supplied [sandbox](sandbox.md), not the host workspace |

The automatic `Control` has no treatment setup. It still receives the common
fixture, dependency installation, shared setup, and runtime tools.

| Setup location               | Applies to                                        |
| :--------------------------- | :------------------------------------------------ |
| Experiment top-level `setup` | All experiment trials, including control          |
| Experiment treatment `setup` | That treatment only                               |
| Benchmark top-level `setup`  | `Benchmark` treatment only                        |
| Benchmark capability `setup` | Both `Control` and `Benchmark` in that capability |

Shared setup runs before treatment setup. Do not accidentally give the tested
resource to control by installing it in shared setup or the fixture.

## Setup fragments

Inside a treatment's `async setup({sandbox})`, use the appropriate method.
These fragments are alternatives, not complete experiment files. Choose one
intervention for a first comparison. MCP and plugin examples contain placeholders;
replace them with real, pinned resources before executing.

Instructions:

```ts
await sandbox.addAgentInstruction('Consult the project documentation before choosing an API.')
```

A discoverable skill with a bundled reference:

```ts
await sandbox.addAgentSkill(
  'api-guide',
  'Use when choosing or migrating project APIs.',
  'Read [the API guide](references/api.md) before selecting a replacement.',
  {
    files: [{path: 'references/api.md', content: '# API guide\n\nUse the documented public entry points.\n'}],
  },
)
```

`contents` is the skill body; the method creates the `SKILL.md` frontmatter.
Supporting files can instead use `{sourcePath, destinationPath}` to copy host
content, including a directory of references. Resolve host paths deliberately,
for example relative to `import.meta.url`. Installing just `SKILL.md` without
its linked references creates a broken treatment.

A custom agent:

```ts
await sandbox.addCustomAgent(
  'api-reviewer',
  'Reviews API migrations for compatibility.',
  'Inspect the changed call sites and check compatibility with the installed package types.',
  {tools: ['read', 'search']},
)
```

Custom agents also accept supporting `files`. Installing an agent or skill does
not guarantee it is invoked; inspect session evidence when discovery is part
of the hypothesis.

A local MCP server (replace the illustrative package before running):

```ts
await sandbox.addMcpServer('docs', {
  type: 'local',
  command: 'npx',
  args: ['-y', '@acme/docs-mcp@1.0.0'],
  tools: ['*'],
})
```

MCP tools run in the container, not the host, so provide reachable dependencies
and endpoints.

A local plugin (replace the illustrative host path before running):

```ts
await sandbox.addCopilotPlugin({
  type: 'local',
  sourcePath: '/absolute/host/path/to/plugin',
})
```

Remote plugins use `{type: 'remote', url, version?}`. Marketplace plugins use
`{type: 'marketplace', name, marketplace: {name, source}}`, where `source` is a
local or remote source. See installed `/sandbox` types for exact shapes.

## Run and verify

Place the chosen setup in an [experiment](experiments.md) treatment or the
top-level setup of a [benchmark](benchmarks.md), then create and inspect a plan.
Run into a fresh output directory.

- Confirm control receives only the fixture and shared prerequisites.
- Inspect saved configuration to confirm the resource and its references exist.
- Inspect sessions for actual invocation or use when the hypothesis depends on
  discovery. Installed resources are not necessarily used resources.

## Pitfalls

Pin or vendor resource contents and preserve their revision with your run.
Avoid unpinned remote installs for comparisons you intend to reproduce.
Never bake credentials into a resource or fixture. See [sandbox](sandbox.md)
for command semantics and filesystem boundaries.
