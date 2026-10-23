# Migrations

Find changes introduced after your installed version and follow the linked
guides to migrate and verify your usage.

## Guides

| Version introduced | Entrypoint           | export(s)                                                       | description                                                                       |
| :----------------- | :------------------- | :-------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| 0.19.0             | `@primer/agent-eval` | `BenchmarkTrialOutput`, `ExperimentTrialOutput`, `TrialSummary` | [Handle failed trial results separately](fallible-trial-results.md)               |
| 0.13.0             | `@primer/agent-eval` | `getExperiment`, `listExperiments`                              | [Supply a benchmarks directory when loading experiments](experiment-discovery.md) |

This index is not a complete history of breaking changes before this section
was introduced. Consult the package changelog for releases not covered here.
While the package is pre-1.0, pending migrations use the next minor version;
those entries do not describe published APIs until that release ships.

Use the target release's docs when upgrading; your installed copy cannot
describe later changes. Apply relevant guides in release order.
