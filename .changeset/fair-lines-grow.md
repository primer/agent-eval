---
'@primer/agent-eval': minor
---

Preserve completed evaluation results when sandbox cleanup fails, and report infrastructure errors without rerunning completed agents.

Bound container removal to 30 seconds and report unresolved cleanup rather than waiting indefinitely for Docker.

Allow evaluations to proceed during bounded background cleanup, retry cleanup independently, and stop creating containers when cleanup remains unresolved.

Add `agent-eval container clean --run-id <uuid>` to recover containers left behind by an inactive evaluation run on the same host and user.

Give sandbox commands a one-hour default deadline, configurable through `timeoutMs`, and support cancellation through `signal`. Commands that time out, are cancelled after starting, or lose their output stream retire the container rather than leaving it available for reuse.
