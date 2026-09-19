---
'@primer/agent-eval': minor
---

Preserve completed evaluation results when sandbox cleanup fails, and report infrastructure errors without rerunning completed agents.

Bound container removal to 30 seconds and report unresolved cleanup rather than waiting indefinitely for Docker.

Allow evaluations to proceed during bounded background cleanup, retry cleanup independently, and stop creating containers when cleanup remains unresolved.

Add `agent-eval container clean --run-id <uuid>` to recover containers left behind by an inactive evaluation run on the same host and user.
