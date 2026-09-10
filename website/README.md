# website

## Routes

| URL                           | Description                                     |
| :---------------------------- | :---------------------------------------------- |
| `/`                           | View the latest design system benchmark results |
| `/benchmarks`                 | List benchmarks                                 |
| `/benchmarks/:id`             | View benchmark results and dated runs           |
| `/benchmarks/:id/runs/:date`  | View benchmark run details and walkthroughs     |
| `/experiments`                | List experiments                                |
| `/experiments/:id`            | View experiment details                         |
| `/experiments/:id/runs/:date` | View experiment run details and walkthroughs    |
| `/scenarios`                  | List scenarios                                  |
| `/scenarios/:id`              | View scenario details                           |

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

Benchmark and experiment run details include a **Judges** tab for the selected
model and treatment. Each judge shows its score, scoring criteria, rationale,
and file-backed findings with code snippets. Scores use the judge's configured
scale, not a shared pass/fail threshold. Judge errors and missing results are
shown separately from scored results.
