---
'@primer/agent-eval': minor
---

Separate scenario names from IDs. Scenarios now expose a deterministic hashed `id` and a `name` containing the previous ID value. Use `name` for display and name-based lookups, and regenerate saved plans that reference scenarios by their old IDs. Result metadata includes scenario names alongside hashed IDs.
