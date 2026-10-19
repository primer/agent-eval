# Resource identity and lookup

**Use when:** finding a benchmark, experiment, or scenario through the package
API, or choosing a CLI/configuration reference.

## IDs and names

| Resource   | ID source                                                | Display name                                           |
| :--------- | :------------------------------------------------------- | :----------------------------------------------------- |
| Benchmark  | Hash of the configuration filename without its extension | Configuration `name`                                   |
| Experiment | Hash of the configuration filename without its extension | Configuration `name`                                   |
| Scenario   | Hash of the scenario directory name                      | Configuration `name`, defaulting to the directory name |
| Capability | Hash of its name                                         | Capability `name`                                      |
| Treatment  | Hash of its name                                         | Treatment `name`                                       |

Hashes are namespaced by resource type. They identify resources, not their
contents. Changing a prompt, setup, or display name does not change a benchmark,
experiment, or scenario ID. Renaming its file or directory does.

Inline scenario references accept `{path, name?}`. The optional `name` overrides
the scenario's display name, not its ID. Scenarios with the same directory name
have the same ID, even when loaded from different parent directories.

Trial IDs remain unique UUIDs so repeated trials of the same configuration stay
distinct. Check result and outcome IDs are supplied by graders and are not
resource IDs.

## Package API

`getBenchmark`, `getExperiment`, and `getScenario` accept `id`, never a name or
filename alias. Use the matching `get*ByName` helper for an exact display-name
lookup. Duplicate matches throw an ambiguity error instead of selecting the
first resource.

```ts
import {getScenario, getScenarioByName, listScenarios} from '@primer/agent-eval'

const scenarios = await listScenarios({
  directory: './scenarios',
})
const scenario = await getScenario({
  directory: './scenarios',
  id: scenarios[0].id,
})
const sameScenario = await getScenarioByName({
  directory: './scenarios',
  name: scenario.name,
})
```

Benchmark helpers also require `benchmarksDirectory` and `scenariosDirectory`.
Experiment helpers require `benchmarksDirectory`, `experimentsDirectory`, and
`scenariosDirectory`. All lookup helpers accept an optional `host`.

Use `getBenchmarkId(filenameStem)`, `getExperimentId(filenameStem)`, or
`getScenarioId(directoryName)` to derive an ID without loading a resource.
These helpers accept only the filename stem or directory name, not a full path
or a display name.

## CLI and configuration references

CLI resource arguments and string references in `scenarios` or `benchmark`
accept a hashed ID, display name, or filename/directory alias. Existing commands
such as `npx agent-eval benchmark plan create project` still work for
`benchmarks/project.ts`. If a reference matches multiple resources, use an
unambiguous ID.

## Migration

This changes persisted benchmark, experiment, and scenario IDs. Regenerate
existing plans and results; old identifiers are not migrated automatically.
Use fresh output directories and store website results under
`results/benchmarks/<benchmark-id>/<date>` or
`results/experiments/<experiment-id>/<date>`.

Replace `get*({name: ...})` calls with `get*({id: ...})`, or use `get*ByName` with
the resource's display name. Update manually constructed `Scenario` values to
include `name`.
