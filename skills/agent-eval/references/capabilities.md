# Capabilities

A capability groups scenarios under one behavior that a
[benchmark](benchmarks.md) measures, such as navigation, forms, or API migration.
It is defined inside `capabilities`, not in a separate configuration file.

```ts
{
  name: 'Navigation',
  scenarios: ['001-navigation', '002-navigation-overflow'],
  async setup({sandbox}) {
    await sandbox.runCommand('npm', ['install', '--save-exact', 'example-library@1.0.0'])
  },
}
```

Replace the illustrative dependency with a real, pinned prerequisite.
`name` and `scenarios` are required; `setup` is optional. Scenario references
are folder names under the CLI's scenarios directory. Capability names must
be unique within a benchmark and determine their IDs.

Capability setup runs before treatment setup for **both** `Control` and
`Benchmark`. Put shared dependencies here only when their presence is part of
the common starting environment. Put the resource being evaluated in the
benchmark's top-level setup.

Group related tasks without making one large scenario cover every behavior.
Each scenario should have granular evidence, while the capability provides a
useful reporting category. Beware of oversized capabilities dominating an
aggregate result.

Experiments select scenarios directly and do not have capability groups.
