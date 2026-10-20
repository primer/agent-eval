# Supply a benchmarks directory when loading experiments

Starting in [0.13.0](https://github.com/primer/agent-eval/blob/%40primer/agent-eval%400.13.0/packages/agent-eval/CHANGELOG.md#0130),
`getExperiment` and `listExperiments` require `benchmarksDirectory`, including
for scenario-only experiments. Point it at your project's benchmark directory,
resolved from the same root as the experiment and scenario directories.

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

## Verification

- Run your project's existing TypeScript check. Neither call should report a
  missing `benchmarksDirectory` option.
- Run the updated discovery code. Scenario-backed experiments should still load;
  benchmark-backed experiments should resolve their referenced benchmarks.
