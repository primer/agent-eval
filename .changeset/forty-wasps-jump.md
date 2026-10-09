---
'@primer/agent-eval': patch
---

Fix output-token totals for Copilot CLI and SDK trials by collecting usage
statistics instead of relying on message events that no longer include token
counts. Preserve compatibility with older session output.
