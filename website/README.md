# website

## Development

Run `pnpm --dir website dev` from the repository root.

The root layout renders the attributes that Primer's `focus-visible` polyfill
adds before hydration, so the server and client markup match without suppressing
hydration warnings.

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
Only bundles matching the current schemas are loaded. Invalid JSON or an
incompatible manifest or trial schema causes the whole bundle to be excluded,
with a warning identifying the file. This avoids displaying partial comparisons.
Recorded files are not deleted or rewritten. Missing trial files, unsafe paths,
and inconsistent IDs remain errors.

Move or upload result directories as complete bundles. Trial walkthrough paths
such as `walkthrough/screenshot.png` are resolved through
`artifacts.walkthroughDirectory` into the bundle's `artifacts/` directory.

Run pages initially include only trial summaries, tab counts, and data URLs.
Selecting a trial loads its checks, judges, and walkthrough URLs from a separate
JSON file. Transcripts load only when their tab is opened. Requests are shared
and cached during the browser session; failures show an error and a retry button.
Changing the selection cannot display a previous trial's pending response.

Screenshots and videos are served as separate files, not embedded base64 data.
The first walkthrough image and any images in the viewport load eagerly;
offscreen images load lazily, and videos use `preload="none"`.
Walkthrough loading placeholders reserve the preview's aspect ratio and gallery
layout, using Primer spinners until images finish loading. Other tabs use Primer
skeletons and loading indicators. Media failures offer a retry; idle videos do
not show a spinner until playback is buffering.

The `/run-data/...` GET route generates per-trial JSON and media files during
`next build` and serves them during development. These files are included in
`website/out` and respect `PAGES_BASE_PATH`. Deploy the entire static export
together so page summaries and their linked assets remain consistent. No API
server is needed in production.

Benchmark and experiment run details include a **Checks** tab for outcomes,
measurements, group IDs, units, scoring directions, and errors. Skipped outcomes
use a neutral skip icon, alongside the green pass and red fail icons. The trial
selector exposes repeated trials for the same model and treatment. Benchmark run
details can be filtered by capability, with shared scenarios displayed separately
under each capability.

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

Benchmark tables break down checks and usage by capability, scenario, and model.
Trend charts and their tables can be filtered by capability and scenario.
Each saved trial's `capabilityId` links to the capability metadata in `output.json`,
so a scenario shared by multiple capabilities is attributed to the correct one.
Overall results include each trial once.

Benchmark and experiment run details include a **Judges** tab for the selected
model and treatment. Each judge shows its score, scoring criteria, rationale,
and file-backed findings with code snippets. Scores use the judge's configured
scale, not a shared pass/fail threshold. Judge errors and missing results are
shown separately from scored results.

Scenario pages show configured checks, text previews of their reference files
(including test sources), and `scenario.config.ts`. There is no longer an
implicit `testPath` or a guaranteed Vitest report; outcome IDs replace test names,
and only check-level descriptions are recorded.

There are no legacy adapters or inferred capability associations. In particular,
manifests using `benchmarkId` or `experimentId` instead of `id`, and benchmark
trials without `capabilityId`, are excluded. Generate results with the current
package to include them in the website.
