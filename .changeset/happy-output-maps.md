---
'@primer/agent-eval': minor
---

Replace the legacy agent-eval output API and remove the `@primer/agent-eval/output` entry point.

- Replace `createAgentEvalOutput` with `output` from `@primer/agent-eval/experiment` or `getExperimentOutput` from the package root.
- Replace `parseAgentEvalOutput` with `deserialize` from `@primer/agent-eval/experiment` or `deserializeExperimentOutput` from the package root.
- Replace `AgentEvalOutput` with `ExperimentOutput`.
- Replace `AgentEvalOutputResult` with trial records represented by `TrialResult`.

Experiment output now stores scenarios, treatments, and trials in keyed maps, records model variants and per-session agent metrics, and uses directory-oriented artifact fields.
