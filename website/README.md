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

Each trial's **Code** tab shows the saved `artifacts.workspaceDirectory` as an
expandable file tree with read-only UTF-8 text previews. This is the final saved
workspace, including starter files, rather than a diff of the agent's changes.
Workspaces are read at build time, so the explorer also works in the static export.
Missing workspaces have an unavailable message.

Dependency, build, and Git directories (`node_modules`, `.next`, `.turbo`, `dist`,
and `.git`) are omitted. Symbolic links and binary files cannot be previewed.
Previews are limited to 256 KiB per file and 2 MiB per workspace; the tree is limited
to 2,000 entries and 50 directory levels. Limits are indicated in the explorer.
Review workspace contents before publishing a result bundle, as previewable files
are included in the website.
