---
'@primer/agent-eval': minor
---

Require `runner` on parsed experiment and benchmark trial outputs. Legacy output
files without a runner default to `copilot-cli` when parsed. Consumers constructing
trial output objects directly must include `runner: 'copilot-cli'` or
`runner: 'copilot-sdk'`.
