# website

## Development

Run `pnpm --dir website dev` from the repository root.

The root layout renders the attributes that Primer's `focus-visible` polyfill
adds before hydration, so the server and client markup match without suppressing
hydration warnings.

## Routes

| URL                                      | Description                                          |
| :--------------------------------------- | :--------------------------------------------------- |
| `/`                                      | View the results for the design system benchmark     |
| `/benchmarks`                            | List benchmarks                                      |
| `/benchmarks/:id`                        | View benchmark results and dated runs                |
| `/experiments`                           | List experiments                                     |
| `/experiments/:id`                       | Compare latest treatments, scenarios, and dated runs |
| `/scenarios`                             | List scenarios                                       |
| `/scenarios/:id`                         | View scenario details                                |
| `/runs`                                  |                                                      |
| `/runs/:id`                              |                                                      |
| `/runs/:id/trials/:trial_id/walkthrough` |                                                      |
| `/runs/:id/trials/:trial_id/checks`      |                                                      |
| `/runs/:id/trials/:trial_id/judges`      |                                                      |
| `/runs/:id/trials/:trial_id/transcript`  |                                                      |
| `/runs/:id/trials/:trial_id/tools`       |                                                      |
| `/runs/:id/trials/:trial_id/code`        |                                                      |
