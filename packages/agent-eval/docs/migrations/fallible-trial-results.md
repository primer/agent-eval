# Handle failed trial results separately

In 0.19.0, benchmark and experiment trial outputs become a `type`-discriminated
union. Successful trials have `type: 'success'` and retain their existing fields.
Failed trials have `type: 'error'`, identifying metadata, and an `error` with
`name`, `message`, and optional `stack`. They do not have sessions, checks,
judges, walkthroughs, or artifact locations.

Image builds, sandbox creation, trial stages, and sandbox cleanup retry up to
three times. Exhausted failures become trial results rather than aborting other
trials. Trial failures and failed check assertions remain distinct.

## Before (0.18.x)

```ts
import type {ExperimentTrialOutput} from '@primer/agent-eval'

function readSessions(trial: ExperimentTrialOutput) {
  return trial.agent.sessions
}
```

## After (0.19.0)

```ts
import type {ExperimentTrialOutput} from '@primer/agent-eval'

function readSessions(trial: ExperimentTrialOutput) {
  if (trial.type === 'error') {
    throw new Error(`${trial.id}: ${trial.error.name}: ${trial.error.message}`)
  }

  return trial.agent.sessions
}
```

Use the same narrowing for `BenchmarkTrialOutput`. The public parsers and
schemas read historical trial files without `type` as successful results.
The manifest's trial-file mapping stays unchanged.

`agent-eval scenario run` keeps embedded results. Branch on
`entry.result.type`; each entry's `trial` now retains `id`, `model`, `runner`,
`scenarioId`, and `treatmentId`, including when execution fails.

`TrialSummary.runs` counts completed trials, `errors` counts failed trials,
and `scenarioRuns` includes both for check-completeness reporting. Usage
aggregates exclude failed trials and their retries; they are not a full cost
accounting. Update manually constructed summaries to include `errors: 0`, or
use `createTrialSummary()`.

## Verify

Run your TypeScript checks and read a bundle containing both result types.
Confirm every planned trial is present, failed trials retain their error and
identifiers through shard merges, and only successful trials contribute
sessions or usage. All-error groups should show failures and unavailable
usage, not successful evaluations with zero cost.
