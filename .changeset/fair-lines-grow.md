---
'@primer/agent-eval': patch
---

Preserve completed evaluation results when sandbox cleanup fails, and report infrastructure errors without rerunning completed agents.

Bound container removal to 30 seconds and report unresolved cleanup rather than waiting indefinitely for Docker.
