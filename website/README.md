# @primer/agent-eval-website

## Local results

Install the optional website alongside `@primer/agent-eval` to view results without
cloning this repository. Core evaluation commands do not require the website or
its Next.js, React, and Primer dependencies.

```sh
npm install --save-dev @primer/agent-eval @primer/agent-eval-website
npx agent-eval ui dev --results ./results
npx agent-eval ui build --results ./results --output-dir ./out
```

`--results` accepts a directory of portable experiment, benchmark, or scenario
results, or a single JSON bundle. Development serves localhost on port 3000
(`--port` overrides it), and automatically refreshes as result JSON files are
added, updated, or deleted. It can start before the results directory exists.
Invalid bundles appear as errors in development and fail a static build.

The local viewer reuses the website's Primer shell and run viewer: model,
treatment and trial selection, checks, judges, transcripts, walkthroughs, and
read-only saved workspace previews. It reads recorded JSON rather than executing
project configuration. Local workspace previews are plain text.

Builds produce a complete Next.js static export and `.nojekyll`. For hosting
under a subpath, add `--base-path /my-repository`. The destination must be empty
and must not overlap the results directory. Source results and the installed
package are never modified; the app builds in a disposable workspace in the
current directory, which must be writable. Review saved workspace and transcript
contents before publishing.

## Hosted website

The repository's default website retains its overview and configured resource
pages. The following routes and details describe that website; the optional
local viewer provides a single results page.

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
Multiple screenshots appear in a full-width carousel with Previous and Next
buttons and an image count. Only the selected image loads; the first walkthrough
image and visible images load eagerly, while offscreen walkthroughs load lazily.
Videos use `preload="none"`.
Walkthrough loading placeholders reserve a single full-width preview's aspect
ratio, using Primer spinners until images finish loading. Other tabs use Primer
skeletons and loading indicators. Media failures offer a retry; idle videos do
not show a spinner until playback is buffering.

The `/run-data/...` GET route generates per-trial JSON and media files during
`next build` and serves them during development. These files are included in
`website/out` and respect `PAGES_BASE_PATH`. Deploy the entire static export
together so page summaries and their linked assets remain consistent. No API
server is needed in production.

Public trial details use scenario-relative paths for check and judge reference
files. Host filesystem paths are not included in that reference metadata, and
the original result bundles are left unchanged.

Benchmark and experiment run details include a **Checks** tab for outcomes,
measurements, group IDs, units, scoring directions, and errors. Skipped outcomes
use a neutral skip icon, alongside the green pass and red fail icons. The trial
selector exposes repeated trials for the same model and treatment. Benchmark run
details can be filtered by capability, with shared scenarios displayed separately
under each capability.

Each selected trial shows a **Copilot CLI** or **Copilot SDK** label in its run
summary. Trial selector options also identify the runner when comparing trials
for the same model and treatment. Older results without runner metadata are
displayed as Copilot CLI.

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

The overview includes each configured experiment and its latest dated run.
It reads only the newest available result bundle for each experiment; dated
run history is loaded on the experiment page.
Experiment pages compare treatments separately for each model and reasoning
effort, both across the run and within each scenario. Check summaries use the
same per-trial averaging and missing-value reporting described above. Output tokens, premium
requests, session time, and API time are averages per recorded trial. Trial and
scenario counts are shown so differences in coverage are visible; these are
descriptive results, not paired comparisons or significance estimates.

Select **View output** for a scenario to open its walkthrough, checks,
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

Each trial's **Code** tab shows the saved `artifacts.workspaceDirectory` as an
expandable file tree with read-only UTF-8 text previews. This is the final saved
workspace, including starter files, rather than a diff of the agent's changes.
Workspaces are read at build time, so the explorer also works in the static export.
Missing workspaces have an unavailable message.

Recognized file types use Shiki syntax highlighting with GitHub light and dark
themes that follow the website's color mode. Unknown file types remain plain text.
Previews are highlighted on the server and exported as individual JSON assets.
The explorer fetches a preview only when its file is selected, keeping file contents,
tokens, Shiki, and language grammars out of the initial results page. Highlighting
runs at build time for the static export, or on request during local development.
The browser renders the returned tokens as escaped text, not generated HTML.
Production export workers reuse a bounded index of up to eight workspaces,
including in-flight reads, so generating each file preview does not rescan its
workspace. Each index retains only the files allowed by the preview limits below.
Local development bypasses this cache so edits are visible on the next request.

Dependency, build, and Git directories (`node_modules`, `.next`, `.turbo`, `dist`,
and `.git`) are omitted. Symbolic links and binary files cannot be previewed.
Workspace paths containing a symbolic link at or below the artifacts directory
are rejected, even if the link points to another directory inside the same bundle.
Previews are limited to 256 KiB per file and 2 MiB per workspace; the tree is limited
to 2,000 entries and 50 directory levels. Limits are indicated in the explorer.
Review workspace contents before publishing a result bundle, as previewable files
are included in the website.

Scenario pages show configured checks, text previews of their reference files
(including test sources), and `scenario.config.ts`. There is no longer an
implicit `testPath` or a guaranteed Vitest report; outcome IDs replace test names,
and only check-level descriptions are recorded.

There are no legacy adapters or inferred capability associations. In particular,
manifests using `benchmarkId` or `experimentId` instead of `id`, and benchmark
trials without `capabilityId`, are excluded. Generate results with the current
package to include them in the website.
