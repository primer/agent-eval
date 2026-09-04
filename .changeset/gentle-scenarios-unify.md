---
'@primer/agent-eval': minor
---

Move scenario APIs to `@primer/agent-eval/scenario`, replacing `defineScenario`, `findScenario`, and `ResolvedScenario` with `defineConfig`, `getScenario`, and `Scenario`. Add scenario schemas and remove the legacy `@primer/agent-eval/scenarios` entry point and `loadScenarioDirectory`.
