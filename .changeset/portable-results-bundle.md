---
'@primer/agent-eval': minor
---

Add `--output-dir` for creating portable experiment and benchmark result bundles containing `output.json` and an `artifacts` directory.

Artifact and walkthrough paths in bundled output are relative to `output.json`, so the complete directory can move between machines without path rewriting. `--output-dir` cannot be combined with `--output` or `--artifacts`.
