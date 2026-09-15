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

The website reads the current schemas exported from `@primer/agent-eval`.
Each `output.json` has an `id` and maps trial IDs to bundle-relative JSON files.
Reading a bundle is read-only, including when it is loaded more than once.
Malformed current bundles, missing trial files, and mismatched IDs are errors.

Move or upload result directories as complete bundles. Trial walkthrough paths
such as `walkthrough/screenshot.png` are resolved through
`artifacts.walkthroughDirectory` into the bundle's `artifacts/` directory.

Benchmark and experiment run details include a **Checks** tab for outcomes,
measurements, group IDs, units, scoring directions, and errors. Skipped outcomes
are shown separately from failures. The trial selector exposes repeated trials
for the same model and treatment.

Summaries use the package's reporting helpers: each check's value is its pass
percentage or measurement mean for a trial, averaged across trials. Skips and
errors do not contribute values; missing values, skips, and errors are reported
separately. Check summaries keep different units and directions separate. Model
ordering uses equal-weight ranks across shared, directed checks with complete,
error-free values; implementation-agent usage breaks ties. Judge sessions are
excluded from usage totals.

Trend charts show each check separately, alongside usage totals. Percent change
is `(Benchmark - Control) / Control * 100`; missing values and nonzero changes
from a zero baseline are `N/A`. Check data is available in the run's Checks tab,
and chart values are also available in the raw trend data table.

Benchmark and experiment run details include a **Judges** tab for the selected
model and treatment. Each judge shows its score, scoring criteria, rationale,
and file-backed findings with code snippets. Scores use the judge's configured
scale, not a shared pass/fail threshold. Judge errors and missing results are
shown separately from scored results.

Scenario pages show configured checks, text previews of their reference files
(including test sources), and `scenario.config.ts`. There is no longer an
implicit `testPath` or a guaranteed Vitest report; outcome IDs replace test names,
and only check-level descriptions are recorded.

### Refactor limitations

- Legacy bundles with `benchmarkId` or `experimentId` instead of `id` remain
  listed, but display an explicit incompatibility message. They are excluded
  from comparisons and trends, not treated as zero-score runs. Regenerate these
  runs with the current package to view results.
- Current benchmark trial outputs do not contain a capability ID. Capability
  comparisons and filtering cannot be recovered reliably from scenario IDs,
  since a scenario can belong to multiple capabilities. The website shows
  overall, scenario, and model results without inferring capability membership.
