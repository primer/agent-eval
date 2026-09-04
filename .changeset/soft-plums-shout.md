---
'@primer/agent-eval': patch
---

Install `git` in the sandbox Docker image so that commands like `npx skills add` that clone repositories no longer fail with `spawn git ENOENT`.
