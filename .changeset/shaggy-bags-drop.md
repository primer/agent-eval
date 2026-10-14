---
'@primer/agent-eval': minor
---

Add optional `annotations` arrays to check outcomes and measurements. Each annotation includes a required `message` and optional `context` and `snippet` strings, preserved in saved benchmark and experiment trial output.

`createVitestCheck` now includes each assertion's full name as an annotation message and its reported test file as the annotation context.
