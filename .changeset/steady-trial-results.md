---
'@primer/agent-eval': patch
---

Correct trial artifacts and benchmark comparisons by excluding the temporary `agent-browser` walkthrough skill from downloaded artifacts, comparing test success rates instead of passed-test totals, and reporting equal benchmark metrics as a 0% change.
