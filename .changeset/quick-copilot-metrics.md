---
'@primer/agent-eval': patch
---

Improve Copilot result collection by accepting sub-agent `user.message` events without `agentMode`, preserving their routing fields, and collecting output token counts from `model.message` events while retaining compatibility with older Copilot output.
