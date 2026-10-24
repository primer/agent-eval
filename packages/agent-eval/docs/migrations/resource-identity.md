# Resource identity

In 0.19.0, benchmarks, experiments, and scenarios accept an optional nonblank
`id`. Without it, identity uses the local hash of `Benchmark:<path>`,
`Experiment:<path>`, or `Scenario:<path>`. Paths are relative to the configured
resource root and use `/` separators. Benchmark and experiment paths omit the
module extension; scenario paths identify the directory.

Filename and directory selectors continue to work. Explicit IDs are used
unchanged and must be unique within each resource kind's discovery scope.
Moving a resource root preserves derived IDs; moving a resource within that
root changes its derived ID.

## Preserve existing identity

Before (0.18.1, `scenarios/login/scenario.config.ts`, ID `login`):

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  prompt: 'Add a login form.',
})
```

After (0.19.0, same ID even if the directory is renamed):

```ts
import {defineConfig} from '@primer/agent-eval/scenario'

export default defineConfig({
  id: 'login',
  prompt: 'Add a login form.',
})
```

To reuse existing plans or continue result history, set `id` to the previously
recorded ID on every referenced resource: the benchmark or experiment and its
scenarios. Before 0.19.0, benchmark and experiment IDs are filenames without
extensions; scenario IDs are directory names or inline `name` overrides.
Inline `name` no longer overrides identity; pin the scenario's config `id`
instead. A single scenario now has the same identity through string and inline
references.

If preserving history is unnecessary, omit `id` and regenerate plans after
upgrading. Existing result files remain readable, but old and new IDs represent
separate histories.

## Verify

Create a plan with
`npx agent-eval experiment plan create comparison --output-path ./comparison-plan.json`.
Check its top-level `id` and trial `scenarioId` values against the IDs you intend
to preserve. After renaming a pinned resource, update path references and create
another plan; those IDs must remain unchanged. The CLI continues to select
resources by their filename or directory name as well as their resolved ID.
