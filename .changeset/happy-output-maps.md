---
'@primer/agent-eval': minor
---

Replace `createAgentEvalOutput`, `parseAgentEvalOutput`, `AgentEvalOutput`, and `AgentEvalOutputResult` with the experiment `output` and `deserialize` helpers, `ExperimentOutput`, and `TrialResult`. Experiment output now uses keyed maps, model variants, per-session agent metrics, and directory-oriented artifact fields.
