---
'@primer/agent-eval': minor
---

Add public trial and treatment APIs for composing and inspecting individual evaluation runs.

The package root now exports `TrialSchema`, `TrialResultSchema`, `runTrial`, `compareTrial`, `Trial`, and `TrialResult`, plus `TreatmentSchema`, `ControlTreatment`, and `Treatment`. The previous `TreatmentResult` type is replaced by `TrialResult`, and treatments now use a schema-backed `{name, setup?}` shape.

Trials continue to run optional scenario browser tests with Playwright and combine their results with the standard scenario test results.
