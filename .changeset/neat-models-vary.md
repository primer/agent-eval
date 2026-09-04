---
'@primer/agent-eval': minor
---

Replace the previous model configuration helpers with model variants.

`ExperimentModelConfig`, `ModelInfo`, and `resolveModelConfigs` are removed. Experiment and benchmark configurations now use `ModelVariantConfig`; resolved runs use `ModelVariant`; and validation and expansion are provided by `ModelVariantSchema`, `ModelVariantConfigSchema`, and `getModelVariants`. Low-level model helpers and types are no longer exported from the package root or experiment entry point.
