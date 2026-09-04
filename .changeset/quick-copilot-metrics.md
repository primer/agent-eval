---
'@primer/agent-eval': patch
---

Accept sub-agent `user.message` events without `agentMode` and preserve their routing fields. Collect output token counts from `model.message` events while retaining compatibility with older Copilot output.
