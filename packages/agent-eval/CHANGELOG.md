# @primer/agent-eval

## 0.9.0

### Minor Changes

- b0e36fa: Add support for `gpt-6-sol`, `gpt-6-luna`, and `claude-opus-5.5` with `low`, `medium`, `high`, `xhigh`, and `max` reasoning effort.
- d1aa8c7: Include AI usage credits in agent-session statistics when Copilot reports usage totals. Trial summaries aggregate credits as `aiCredits`, and benchmark and experiment reports compare the total against control. Older results without credit information remain supported and report `N/A`.

## 0.8.0

### Minor Changes

- 773764a: Add support for "image" config option to scenarios for configuring custom docker images

## 0.7.1

### Patch Changes

- 2449149: Update TypeScript declarations for benchmark, experiment, and scenario configs to be portable

## 0.7.0

### Minor Changes

- 4cea504: Add support for Claude Fable 5, Claude Fable 5.1, and GPT-6 Astra in benchmarks,
  experiments, and judges, with low, medium, high, xhigh, and max reasoning efforts.

### Patch Changes

- 7396a79: Fix missing `memfs` runtime dependency so the package can be used without installing development dependencies.

## 0.6.1

### Patch Changes

- 14bed90: Artificial bump to sync docs to npm and bring in skills to git tag

## 0.6.0

### Minor Changes

- 28c6103: Update agent-eval cli to a sub-command based setup instead of flags based
- 28c6103: Add support for LLM-as-a-judge through the new "judges" option in scenario config files
- dd82d90: Add support for both Copilot SDK and Copilot CLI through the `-runner copilot-sdk|copilot-cli` option
- 28c6103: Add support for deterministic checks through the new "checks" option in scenario config files. This replaces the previous scenario.test.ts and scenario.browser.test.ts conventions

## 0.5.0

### Minor Changes

- c9d33ed: Add benchmark configuration, discovery, execution, and output APIs through `@primer/agent-eval/benchmark` and explicitly named package-root exports. The CLI can now select and run benchmarks from a benchmarks directory.
- c02b5e6: Add durable plan creation, replay, deterministic sharding, and result merging to the CLI and public package API.
- c9d33ed: Move experiment APIs to `@primer/agent-eval/experiment`, replacing `findExperiment`, package-root `run`, and package-root `defineConfig` with `getExperiment`, `runExperiment`, and `defineExperimentConfig`. Remove the legacy experiment loading helpers in favor of `getExperiment` and `listExperiments` with explicit source directories.
- b6c4aca: Add support for LLMs-as-a-judge in scenarios with the "judges" config
- c9d33ed: Add `ExperimentConfigSchema` and update experiment configuration to use model variants, the new treatment API, and the new sandbox interface. Scenarios continue to support IDs and `{path, name?}` entries through the exported `ExperimentScenarioConfig` and `InlineScenarioConfig` types.
- c9d33ed: Move scenario APIs to `@primer/agent-eval/scenario`, replacing `defineScenario`, `findScenario`, and `ResolvedScenario` with `defineConfig`, `getScenario`, and `Scenario`. Add scenario schemas and remove the legacy `@primer/agent-eval/scenarios` entry point and `loadScenarioDirectory`.
- c9d33ed: Replace `createAgentEvalOutput`, `parseAgentEvalOutput`, `AgentEvalOutput`, and `AgentEvalOutputResult` with the experiment `output` and `deserialize` helpers, `ExperimentOutput`, and `TrialResult`. Experiment output now uses keyed maps, model variants, per-session agent metrics, and directory-oriented artifact fields.
- c9d33ed: Add package-root trial and treatment schemas, types, execution helpers, and comparison helpers, replacing `TreatmentResult` with `TrialResult`. Trials continue to run optional Playwright browser tests and combine them with standard scenario test results.
- c9d33ed: Add `@primer/agent-eval/sandbox` for sandbox runtimes, configuration, constants, and the plugin and MCP types previously exported from the experiment entry point. Replace the concrete `Sandbox` class with the `Sandbox` interface plus `SystemSandbox` and `VirtualSandbox`.
- e500d81: Add support for walkthrough artifacts in agent-eval output
- c9d33ed: Replace `ExperimentModelConfig`, `ModelInfo`, and `resolveModelConfigs` with model variant configuration, schemas, and expansion helpers. Low-level model helpers and types are no longer exported from the package root or experiment entry point.
- c9d33ed: Update scenario discovery to support explicit hosts, skip template directories, and recognize `browser.test.ts`. Inline scenario paths remain supported without package discovery requirements and continue to recognize `scenario.browser.test.ts`.
- c9d33ed: Add `--output-dir` for portable experiment and benchmark bundles with artifact and walkthrough paths relative to `output.json`. Remove `--artifacts` and derive the artifact directory from `--output-dir` or the directory containing `--output`.
- c9d33ed: Remove the `@primer/agent-eval/cli` package entry point. Use the `agent-eval` executable for CLI usage and the package root or API entry points for programmatic usage.

### Patch Changes

- 0e49dbf: Prebuild and reuse a local sandbox image from the configured `--docker-image` base, and remove active sandbox containers when an evaluation process receives SIGINT or SIGTERM.
- c9d33ed: Accept sub-agent `user.message` events without `agentMode` and preserve their routing fields. Collect output token counts from `model.message` events while retaining compatibility with older Copilot output.
- c9d33ed: Exclude the temporary `agent-browser` walkthrough skill from downloaded trial artifacts.
- c9d33ed: Compare benchmark test success rates instead of passed-test totals and report equal metrics as a 0% change.

## 0.4.0

### Minor Changes

- bd4eb9a: Add support for installing Copilot plugins in sandbox treatments.

## 0.3.0

### Minor Changes

- fdbb330: Add support for optional scenario browser tests powered by Vitest and Playwright.

## 0.2.0

### Minor Changes

- a49df87: Add an optional description to scenario configuration.

## 0.1.0

### Minor Changes

- c2388a9: Add support for running experiments with Claude Opus 5.
