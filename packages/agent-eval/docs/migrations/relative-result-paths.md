# Relative result artifact paths

Starting in 0.19.0, benchmark and experiment trial JSON stores `artifacts` fields
and walkthrough file references relative to the directory containing
`output.json`. Custom readers should resolve these paths against that directory,
not the trial JSON directory or the current working directory. This also accepts
historical absolute artifact paths.

Before (0.18.x):

```ts
import fs from 'node:fs/promises'

const workspaceFiles = await fs.readdir(trial.artifacts.workspaceDirectory)
```

After (0.19.0):

```ts
import fs from 'node:fs/promises'
import path from 'node:path'

const outputDirectory = path.dirname(outputPath)
const workspaceDirectory = path.resolve(outputDirectory, trial.artifacts.workspaceDirectory)
const workspaceFiles = await fs.readdir(workspaceDirectory)
```

Apply the same resolution to walkthrough `filepath` and `screenshots` entries.
For historical references beginning with `walkthrough/`, resolve the remaining
filename against `artifacts.walkthroughDirectory` instead.

The website and CLI shard merge accept both formats. Runtime trial paths remain
unchanged. Scenario-run embedded results are not affected.

To verify a custom reader, move an entire newly written bundle, including
`output.json` and `artifacts/`, and confirm it can still read a workspace file
and every recorded walkthrough file.
