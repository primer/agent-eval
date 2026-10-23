---
'@primer/agent-eval': minor
---

Preserve failed trials without stopping other trials, and mark affected evaluations incomplete instead of reporting comparisons. Check each trial's `type` before reading successful results; see the [migration guide](https://github.com/primer/agent-eval/blob/main/packages/agent-eval/docs/migrations/fallible-trial-results.md).
