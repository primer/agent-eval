---
'@primer/agent-eval': minor
---

Add support for running benchmark experiments with the `benchmark` option.

Calls to `getExperiment` and `listExperiments` now require `benchmarksDirectory`,
including when loading only scenario-backed experiments.
