# Treatments

A treatment is a named environment intervention with optional asynchronous
`setup({sandbox})`. Examples include instructions, a discoverable skill, an MCP
server, or a plugin. Treatment IDs are derived from names, so keep names stable
when reusing plans.

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

## Resource setup recipes

Inside a treatment's `async setup({sandbox})`, use the appropriate method.
These are alternatives, not a recommendation to combine every intervention.

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

A local MCP server:

```ts
await sandbox.addMcpServer('docs', {
  type: 'local',
  command: 'npx',
  args: ['-y', '@acme/docs-mcp@1.0.0'],
  tools: ['*'],
})
```

Replace the illustrative package with a real, pinned server. MCP tools run in
the container, not the host, so provide reachable dependencies and endpoints.

A local plugin:

```ts
await sandbox.addCopilotPlugin({
  type: 'local',
  sourcePath: '/absolute/host/path/to/plugin',
})
```

Remote plugins use `{type: 'remote', url, version?}`. Marketplace plugins use
`{type: 'marketplace', name, marketplace: {name, source}}`, where `source` is a
local or remote source. See installed `/sandbox` types for exact shapes.

Pin or vendor resource contents and preserve their revision with your run.
Avoid unpinned remote installs for comparisons you intend to reproduce.
Never bake credentials into a resource or fixture. See [sandbox](sandbox.md)
for command semantics and filesystem boundaries.
