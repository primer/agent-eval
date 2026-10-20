# Supply a benchmarks directory when loading experiments

- Source version: `0.12.x`
- Target version: `0.13.0`
- Status: breaking change
- Affected API: `getExperiment` and `listExperiments` from `@primer/agent-eval`
- Mapping: add the required `benchmarksDirectory: string` option to both calls

## Contents

- [Who needs to migrate](#who-needs-to-migrate)
- [Before and after](#before-and-after)
- [Migration steps](#migration-steps)
- [Verification](#verification)
- [Evidence](#evidence)

## Who needs to migrate

Projects calling either experiment-loading function must supply a benchmarks
directory, even when every experiment uses scenarios directly. Projects using
only the CLI do not need to change these programmatic calls.

Version `0.13.0` adds experiments backed by a benchmark. The loader therefore
needs the benchmark source directory in addition to experiment and scenario
directories.

## Before and after

Before (`0.12.x`):

```ts
import path from 'node:path'
import {listExperiments} from '@primer/agent-eval'

const experiments = await listExperiments({
  experimentsDirectory: path.resolve('experiments'),
  scenariosDirectory: path.resolve('scenarios'),
})
```

After (`0.13.0`):

```ts
import path from 'node:path'
import {listExperiments} from '@primer/agent-eval'

const experiments = await listExperiments({
  benchmarksDirectory: path.resolve('benchmarks'),
  experimentsDirectory: path.resolve('experiments'),
  scenariosDirectory: path.resolve('scenarios'),
})
```

For `getExperiment`, add the same option while preserving the existing `name`,
`host` (if supplied), and other directory options. Imports and return handling
do not change for this migration.

## Migration steps

1. Locate direct calls and wrappers around `getExperiment` and `listExperiments`,
   including options objects assembled outside the call.
2. Add `benchmarksDirectory` to each options object. Resolve it from the same
   project root as the experiment and scenario directories.
3. For benchmark-backed experiments, point it at the directory containing the
   referenced benchmark configurations. Do not assume a directory named
   `benchmarks` if the project uses a custom layout.
4. Keep the option for scenario-only experiments too; it is required by the
   function signatures. There is no need to convert them to benchmark experiments.

## Verification

- Run your project's existing TypeScript check. Neither call should report a
  missing `benchmarksDirectory` option.
- Run the updated discovery code. Scenario-backed experiments should still load;
  benchmark-backed experiments should resolve their referenced benchmarks.
- If discovery fails, check directory resolution and referenced benchmark IDs
  before changing experiment configurations.

## Evidence

The [0.13.0 changelog](https://github.com/primer/agent-eval/blob/%40primer/agent-eval%400.13.0/packages/agent-eval/CHANGELOG.md#0130)
records the new benchmark option and explicitly requires `benchmarksDirectory`
for both loading functions, including scenario-only experiments.

The release implementations establish the before/after option shapes:

- `0.12.0`: [`listExperiments`](https://github.com/primer/agent-eval/blob/%40primer/agent-eval%400.12.0/packages/agent-eval/src/experiment/list.ts#L20-L24)
  and [`getExperiment`](https://github.com/primer/agent-eval/blob/%40primer/agent-eval%400.12.0/packages/agent-eval/src/experiment/get.ts#L5-L10)
  accept experiment and scenario directories without a benchmarks directory.
- `0.13.0`: [`listExperiments`](https://github.com/primer/agent-eval/blob/%40primer/agent-eval%400.13.0/packages/agent-eval/src/experiment/list.ts#L22-L27)
  and [`getExperiment`](https://github.com/primer/agent-eval/blob/%40primer/agent-eval%400.13.0/packages/agent-eval/src/experiment/get.ts#L5-L11)
  require `benchmarksDirectory: string`.
