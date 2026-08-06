# AGENTS.md

- The project uses pnpm for managing dependencies
- Add repository automation scripts to the `script` directory
- For tests, use `pnpm test --run`. You can optionally apply a filter to filter
  by test name, path, etc
- For linting, use `pnpm lint`. You can optionally provide a path to lint specific files or directories
- For formatting, use `pnpm format`. This will format all files in the project
- For type checks, use `pnpm type-check`. You can also call `type-check` on
  individual workspaces

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
- Always run the tasks in ci.yml before committing so that ci is green
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
