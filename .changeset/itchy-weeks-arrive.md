---
'@primer/agent-eval': patch
---

Validate manifest consistency through schemas before loading configurations or
trial artifacts. Reject metadata IDs that differ from their manifest keys,
duplicate benchmark capability scenario IDs, and conflicting metadata across
benchmark result shards. Duplicate trial IDs and other merge conflicts now report
schema errors with field paths.
