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
- Keep `skills/agent-eval/SKILL.md` and its `references/` up-to-date in the same
  change when changes to project structure, methodology, domain models, public
  APIs, CLI commands, or runtime requirements affect their guidance. Keep
  `SKILL.md` concise, put detailed guidance in references, and use npm/npx in
  skill examples.

## Code

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
  - Apply reasonable defaults, e.g. `z._defaults(..., [])` for a collection
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
- Export an `experiment` named export created with `defineConfig`
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
