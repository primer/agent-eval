---
'@primer/agent-eval': minor
---

Move experiment APIs to `@primer/agent-eval/experiment`, replacing `findExperiment`, package-root `run`, and package-root `defineConfig` with `getExperiment`, `runExperiment`, and `defineExperimentConfig`. Remove the legacy experiment loading helpers in favor of `getExperiment` and `listExperiments` with explicit source directories.
