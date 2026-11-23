---
'@primer/agent-eval': minor
---

Make plan runs resumable and trial artifacts safer to reuse:

- Add a `--resume` option to `benchmark plan run` and `experiment plan run` that reuses trials already committed to the output directory and runs only the remaining ones. Without `--resume`, selected trials run again and replace their saved artifacts once they succeed.
- Publish each trial's artifacts to `artifacts/<trial-id>/` atomically after a successful attempt, together with a `.agent-eval-trial.json` commit record. Failed attempts no longer leave partial files in `artifacts/`.
- A trial that fails after its retries no longer stops other trials. The remaining trials finish and are saved, then the command fails and lists the failed trial IDs.
