# website

## Routes

| URL                           | Description                                          |
| :---------------------------- | :--------------------------------------------------- |
| `/`                           | View the latest benchmark and experiment results     |
| `/benchmarks`                 | List benchmarks                                      |
| `/benchmarks/:id`             | View benchmark results and dated runs                |
| `/benchmarks/:id/runs/:date`  | View benchmark run details and walkthroughs          |
| `/experiments`                | List experiments                                     |
| `/experiments/:id`            | Compare latest treatments, scenarios, and dated runs |
| `/experiments/:id/runs/:date` | View experiment run details and walkthroughs         |
| `/scenarios`                  | List scenarios                                       |
| `/scenarios/:id`              | View scenario details                                |

## Results

The website reads portable result bundles from:

```text
results/
├── benchmarks/<benchmark-id>/<YYYY-MM-DD>/
│   ├── output.json
│   └── artifacts/
└── experiments/<experiment-id>/<YYYY-MM-DD>/
    ├── output.json
    └── artifacts/
```

Artifact and walkthrough paths are relative to each `output.json`, so result
directories should be moved or uploaded as complete bundles.

The overview includes each configured experiment and its latest dated run.
It reads only the newest available result bundle for each experiment; dated
run history is loaded on the experiment page.
Experiment pages compare treatments separately for each model and reasoning
effort, both across the run and within each scenario. Test pass rates use the
sum of passed tests divided by the sum of total tests. Output tokens, premium
requests, session time, and API time are averages per recorded trial. Trial and
scenario counts are shown so differences in coverage are visible; these are
descriptive results, not paired comparisons or significance estimates.

Select **View output** for a scenario to open its walkthrough, test results,
and transcript. The run viewer supports switching model, treatment, and trial
when multiple trials were recorded. Runs without trials and experiments without
runs show empty states rather than falling back to older results.
Changing the model or treatment selects the first trial for that combination.
Scenario output links also support IDs containing spaces, slashes, and percent
escapes.

Benchmark and experiment run details include a **Judges** tab for the selected
model, treatment, and trial. Each judge shows its score, scoring criteria, rationale,
and file-backed findings with code snippets. Scores use the judge's configured
scale, not a shared pass/fail threshold. Judge errors and missing results are
shown separately from scored results.
