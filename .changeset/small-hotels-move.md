---
'@primer/agent-eval': minor
---

Add Copilot SDK execution alongside the default Copilot CLI runner. Experiments can compare both runners through the `runners` configuration, and benchmark, experiment, and scenario commands accept `--runner copilot-cli` or `--runner copilot-sdk`. Saved plans and result bundles preserve runner selection; running a saved plan with `--runner` selects its existing trials without changing their identities.
