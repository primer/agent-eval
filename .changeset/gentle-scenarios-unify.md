---
'@primer/agent-eval': minor
---

Consolidate scenario configuration and discovery under `@primer/agent-eval/scenario` and remove the legacy `@primer/agent-eval/scenarios` entry point.

- Replace `defineScenario` with `defineConfig` from the scenario entry point or `defineScenarioConfig` from the package root.
- Replace `findScenario` with `getScenario`.
- Replace `ResolvedScenario` with the flattened `Scenario` type.
- Remove `loadScenarioDirectory`.
- Add `ScenarioConfigSchema` and `ScenarioSchema`.

Scenario discovery now accepts an explicit directory and optional host, ignores template directories prefixed with `000`, requires scenario packages to include `package.json`, and resolves browser tests from `browser.test.ts`.

Experiments can continue loading scenarios directly from `{path, name?}` entries without the package discovery requirements, including scenarios that use the legacy `scenario.browser.test.ts` filename.
