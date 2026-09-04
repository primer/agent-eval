---
'@primer/agent-eval': patch
---

Prebuild and reuse a local sandbox image from the configured `--docker-image` base, and remove active sandbox containers when an evaluation process receives SIGINT or SIGTERM.
