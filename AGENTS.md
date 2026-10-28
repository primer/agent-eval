# AGENTS.md

- The project uses pnpm for managing dependencies
- The project uses Turbo for running tasks. Prefer `pnpm exec turbo run <task>`
  whenever a Turbo task exists
- Add repository automation scripts to the `script` directory
- For tests, use `pnpm exec turbo run test -- --run`. You can optionally apply a filter to filter
  by test name, path, etc
- For linting, use `pnpm exec turbo run lint lint:npm`
- For formatting, use `pnpm format`. This will format all files in the project
- For type checks, use `pnpm exec turbo run type-check`. You can use Turbo's
  `--filter` option to target individual workspaces
- README files are public-facing and should only contain information about
  using the package. Keep contributor and agent instructions elsewhere
- Do not create changesets for updates to features, fixes, or other changes
  that have not been released yet
- For backwards-incompatible public API or behavior changes, deprecations, or
  recommended replacements, update `packages/agent-eval/docs/migrations/` in the
  same change. Load the `changesets` skill and its migration reference even when
  no changeset is needed. Index guides by version introduced, entrypoint,
  export(s), and a linked description. Keep guides to a brief change description,
  versioned before/after snippets, and verification; add migration steps only
  when needed. While the package is pre-1.0, use the next minor version for
  pending migrations; revisit this policy at 1.0.
- Update documentation and skill references only when a change affects how
  consumers use the package or makes existing guidance inaccurate. Do not add
  documentation for type inference or declaration portability fixes, internal
  refactors, or regression tests that preserve existing usage, even when the
  fix adds supporting type exports. The synchronization rules below apply only
  when there is a usage or guidance change.
- Keep the method overview in `docs/sandbox.md` in sync with the `Sandbox`
  interface in `packages/agent-eval/src/sandbox/types.ts` whenever methods,
  signatures, or behavior change. Exclude `[Symbol.asyncDispose]()` from the
  table. List method names without arguments; rely on TypeScript for argument
  details.
- Keep `packages/agent-eval/docs/AGENTS.md` and its `references/` up-to-date in the same
  change when changes to project structure, methodology, domain models, public
  APIs, CLI commands, or runtime requirements affect their guidance. Keep
  entrypoint concise, put detailed guidance in references, and use npm/npx in
  doc examples. Keep `skills/agent-eval/SKILL.md` as a pointer to the installed
  package docs.

## Repository profiling

Use the opt-in repository script (Node 26+, no additional dependencies) to
measure a built CLI directly, not pnpm or Turbo:

```sh
pnpm exec turbo run build --filter=@primer/agent-eval
node script/profile.ts -- --help
node script/profile.ts --no-profiles -- experiment plan create noop --output-path artifacts/noop-plan.json
node script/profile.ts --interval-ms 500 -- experiment run noop
node script/profile.ts --docker --output artifacts/profiles -- experiment run noop
```

Replace the example with an existing experiment and its normal CLI arguments
(`node packages/agent-eval/bin/agent-eval --help`). Everything after `--` is
forwarded unchanged. Wrapper options must precede it; `--interval-ms` accepts
10–60000 ms (default 500). Use `--help` or `experiment plan create noop` as
local smoke workloads without executing paid agents or requiring Docker.
`--no-profiles` disables native CPU/heap profiling for repeatable resource
baselines while retaining process sampling and the JSON report. The report's
`instrumentation` fields state which collectors were enabled. Docker is never
contacted unless `--docker` is set.
Explicit Docker profiling requires a Docker CLI and reachable daemon; failures
are reported rather than silently omitted. Each Docker command has a 5-second
timeout and 4 MiB output limit; sampling is serial, with the configured delay
between completed samples.

Each invocation creates a unique `run-*` directory under the ignored
`artifacts/profiles/` directory by default. Alternative `--output` paths are
resolved from the current directory; keep them under `artifacts/` to avoid
accidental commits. Artifacts:

- `report.json`: versioned machine-readable metadata (argv, cwd, Node/platform,
  timings, exit code/signal, errors), cumulative target CPU milliseconds,
  sampled maximum RSS bytes, and Node `resourceUsage` counters. The latter use
  Node's native units, including CPU microseconds and maxRSS KiB.
  `metrics.elapsedMs` is target elapsed time from preload startup;
  `harnessElapsedMs` additionally includes launch, Docker snapshots and sample
  shutdown overhead. Both are labeled separately in the console summary.
- `memory.jsonl`: elapsed milliseconds and target `process.memoryUsage()` samples
  in bytes (`rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers`). Sampling
  starts before CLI import and flushes on exit; it can miss short-lived peaks.
- Native `.cpuprofile` and `.heapprofile` files: inspect CPU call stacks and
  allocation sampling in Chrome DevTools' Performance/Memory tools. Heap
  profiles are sampled allocations, **not heap snapshots** or retained-object
  graphs. Forced termination can leave native profiles incomplete or absent;
  the report and last flushed process metrics still help diagnose failures.
- With `--docker`, `docker-stats.jsonl` contains timestamped Docker JSON rows
  (CPU percentage, memory usage/limit, block I/O and Docker-provided units).
  `docker-disk-before.jsonl` and `docker-disk-after.jsonl` contain read-only
  `docker system df` snapshots; they are not peak disk measurements.

Process metrics describe the target Node process and its threads, not its
subprocesses, remote agents or containers. Native CPU profiles describe
JavaScript execution, not total system CPU. RSS and CPU cover process threads;
heap fields describe the main isolate, not worker heaps. Node forks/workers may
inherit native profiling flags and produce additional profiles; identify them
by filename PID/thread ID rather than aggregating them into target totals.
The metrics preload does not instrument those descendants. Docker metrics are explicitly
**daemon-wide**, covering all running containers because there is no run label
filter. Unrelated workloads, removed containers and activity between samples
prevent attributing these measurements to one trial. No Docker resources are
created, stopped or pruned by the profiler. SIGINT/SIGTERM are forwarded to the
target, with SIGKILL escalation after 5 seconds if it ignores shutdown; the
target remains responsible for its own child/container cleanup. Nonzero target
exits are preserved; profiling errors make an otherwise successful run fail.

For an optimization:

1. Build each revision before measuring. Record the revision, machine,
   experiment/scenario, model, concurrency and profiling interval; hold those
   inputs constant. Avoid unrelated workloads on the host/daemon.
2. Separate cold and warm measurements. Define cold state explicitly (for
   example a fresh dedicated workspace/daemon without scenario images or
   caches); never prune a shared daemon. Warm up once with the same workload,
   then repeat at least three measured warm runs. Do not mix cold image builds
   with warm execution results or call a fresh Node process a cold Docker run.
3. Compare repeated `report.json` values and raw samples across revisions using
   identical settings; compare `metrics.elapsedMs` rather than
   `harnessElapsedMs` for target wall time. Use CPU stacks to
   identify hot code, make one focused change, then rerun the same workload.
4. Compare resource baselines with `--no-profiles`, keeping sampling settings
   identical, then confirm the improvement also holds using the CLI directly
   without the wrapper. Native profiling, synchronous metric writes and Docker
   polling add overhead; agent/network latency and short workloads can dominate.
   Don't infer a regression or improvement from a single run.

Reports intentionally do not capture environment variables. Nevertheless argv,
paths, profile source locations, container names and workload data may be
sensitive. Do not put credentials in CLI arguments; inspect/redact artifacts
before sharing and never commit raw profiles by default.

## Evidence for decisions

- When a decision, recommendation, or review finding relies on a resource,
  include the specific evidence and explain how it supports the conclusion.
- Cite repository files with paths and line numbers. For external resources,
  link to the relevant section or comment and quote the supporting passage
  when line numbers are unavailable.
- Read the cited resource before relying on it. Distinguish what it explicitly
  states from your inference, and state uncertainty or conflicting evidence.

## Code

- Before changing lifecycle code, identify its observable contract and the
  consequences for failure and cleanup. Load the architecture skill and the
  testing skill when changing its tests.
- Parse, don't validate. Use the type system to gurantee correctness.
  - When possible, use zod/mini to parse as much information as possible from a given input
  - When parsing, use the most specific type possible. For example:
    - If a string is expected to be a URL, parse it as a URL instead of a string
    - If the input is a path to a file, determine the correct path and make sure
      the file exists
    - If a collection must have more than one value, use zod to check that it
      is has more than one value
  - Handle as much of this logic as possible when ingesting the unknown data
    instead of having validation and checks sprinkled throughout the library

### Errors and logging

- When logging errors, use the `err` field, not `error`, for example
  `logger.error({err: error}, 'Failed to run trial')`. Pino's default error
  serializer handles `err` and preserves the error message and stack trace.
  Using `{error}` can omit those details and hide the underlying cause.

### Configuration

- Design zod schemas to parse configuration for unknown input
- When designing them, be as permissive as needed for the configuration but:
  - Apply reasonable defaults during parsing with `z._default`, e.g.
    `z._default(z.array(ItemSchema), [])` for a collection
  - Prefer concrete parsed values over `null`, `undefined`, or optional fields
    whenever a meaningful default exists. Reserve optional or nullable fields
    for cases where absence has domain meaning, rather than propagating null
    checks to consumers
  - Transform different inputs into structured types, for example a union of
    object with different fields becomes a discriminated union with a `type` field
- Design `parse*` functions instead of allowing for zod schemas to be called
  directly
- `parse*` functions may need to take more arguments than just the unknown
  input, for example if you need to validate that a path exists
- Accept file paths as either relative (and look them up to get the absolute
  path) or absolute. Include both cases when designing zod schemas and parsing
  unknown input

### Type System

- Encode as much information as possible in the system; make illegal states irrepresentable
  - For example, if a resource requires a state transition (e.g. a docker image needs to be built), represent this as a type and design APIs around using the type that corresponds to the state that it needs instead of needing to code around that state each time it is used

## Pull Requests

- Title format: <conventional type>: description
- Conventional types:
  - feat: A new feature
  - fix: A bug fix
  - docs: Documentation only changes
  - style: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
  - refactor: A code change that neither fixes a bug nor adds a feature
  - perf: A code change that improves performance
  - test: Adding missing tests or correcting existing tests
  - chore: Changes to the build process or auxiliary tools and libraries such as documentation generation
  - ci: A change to our workflows
- Description: A brief description of the changes made in the pull request. It should be concise and informative, providing enough context for reviewers to understand the purpose of the changes.
- Example: "feat: add new authentication method for improved security"
- Fill out the pull request template for the repo
- Always run the tasks in ci.yml before committing so that ci is green,
  except for agentic workflow compilation steps
- When making a change to the website, include before and after screenshots in the Pull Request description.
  ```md
  <details>
    <summary>Before / After</summary>

  | Before                     | After                     |
  | :------------------------- | :------------------------ |
  | <!-- screenshot before --> | <!-- screenshot after --> |

  </details>
  ```

## Adding scenarios

When adding a scenario, follow these rules:

- Unless explicitly asked for, use `scenarios/000-nextjs-template` as the base
  for the scenario
- Add scenarios to `./scenarios` with the next number in the sequence
- Describe (at a high level) what we are testing for the agent
- When authoring the prompt for the scenario, use general language to describe
  the task. Unless explicitly asked for, do not directly mention Primer or
  include in the prompt instructions on how to access/use Primer. We are testing
  tooling that should include Primer into context so things don't need that in
  the prompt

## Adding experiments

When adding an experiment, follow these rules:

- Check to see if an experiment might already exist for this use-case and share
  it, when appropriate
- New experiments are added at `./experiments` as a new `*.ts` file
- Provide an appropriate name for the experiment as its file name
- Use a default export created with `defineConfig`
- Provide an appropriate name and description for what we are testing
- Select appropriate models and scenarios based on the experiment
- For treatments, make sure to include the fewest number possible to meet the
  experiment goals
- If you are not sure about experiment goals, prompt the user for more
  information before creating the experiment

## Next.js: ALWAYS read docs before coding.js

<!-- BEGIN:nextjs-agent-rules -->

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->
