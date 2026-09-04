---
'@primer/agent-eval': minor
---

Consolidate experiment configuration, discovery, execution, and output helpers under `@primer/agent-eval/experiment`.

- Replace `findExperiment` with `getExperiment`.
- Replace the package-root `run` export with `runExperiment`.
- Replace the package-root `defineConfig` export with `defineExperimentConfig`.
- Keep `listExperiments` under the singular experiment entry point and package root.
- Remove `loadExperimentConfigs`, `ExperimentSourceOptions`, and `LoadExperimentOptions`; pass explicit experiment and scenario directories to the new discovery helpers instead.
