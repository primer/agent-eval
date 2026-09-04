---
'@primer/agent-eval': minor
---

Replace the experiment configuration model with schema-backed configuration for resolved trials.

`ExperimentConfigSchema` is now exported, scenarios can be configured by ID or with `{path, name?}` inline path objects, models use model variant configuration, and experiment and treatment setup callbacks use the new sandbox interface. `InlineScenarioConfig` and `ExperimentScenarioConfig` remain available from `@primer/agent-eval/experiment`; `TreatmentConfig` is replaced by the new treatment API.
