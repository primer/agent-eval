---
'@primer/agent-eval': minor
---

Add multi-turn scenario prompts. Set `prompt` to a non-empty array of strings to run turns sequentially in the same sandbox and conversation. String inputs remain supported; parsed configurations, loaded scenarios, and result metadata now expose `prompt` as an array.
