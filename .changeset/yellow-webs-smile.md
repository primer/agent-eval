---
'@primer/agent-eval': minor
---

Add optional `include` and `ignore` arrays to local Copilot plugin sources to select or exclude files, directories, and glob matches before copying them into the sandbox, including local marketplace sources. Omit `include` to select the entire source, or pass `[]` to select nothing; `ignore` takes precedence over `include`.
