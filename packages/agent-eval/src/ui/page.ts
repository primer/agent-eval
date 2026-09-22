import {createHash} from 'node:crypto'
import type {UiResults, UiRun} from './results'

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function revision(results: UiResults): string {
  return createHash('sha256').update(JSON.stringify(results)).digest('hex')
}

function renderTrial(trial: UiRun['trials'][number]): string {
  return `<details>
    <summary>${escapeHtml(trial.scenarioId)} · ${escapeHtml(trial.model.name)} (${escapeHtml(trial.model.reasoningEffort)}) · ${escapeHtml(trial.treatmentId)}</summary>
    <p>Trial: ${escapeHtml(trial.id)} · Runner: ${escapeHtml(trial.runner ?? 'copilot-cli')}</p>
    <h3>Checks (${trial.checks.length})</h3>
    <pre>${escapeHtml(JSON.stringify(trial.checks, null, 2))}</pre>
    <h3>Judges (${trial.judges.length})</h3>
    <pre>${escapeHtml(JSON.stringify(trial.judges, null, 2))}</pre>
    <details><summary>Full trial result</summary><pre>${escapeHtml(JSON.stringify(trial, null, 2))}</pre></details>
  </details>`
}

function renderPage(results: UiResults, live = false): string {
  const runs = results.runs.map(run => {
    return `<section>
      <h2>${escapeHtml(run.id)}</h2>
      <p>${run.kind} · ${escapeHtml(run.file)} · ${run.trials.length} trials</p>
      ${run.trials.map(renderTrial).join('\n')}
    </section>`
  })
  const errors = results.errors.map(error => {
    return `<section role="alert"><h2>Unable to read ${escapeHtml(error.file)}</h2><pre>${escapeHtml(error.message)}</pre></section>`
  })
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>agent-eval results</title>
  <style>
    :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
    body { max-width: 1100px; margin: 0 auto; padding: 2rem; }
    section { border: 1px solid #888; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    h1, h2, h3 { line-height: 1.2; }
    summary { cursor: pointer; padding: .5rem 0; overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 1rem; background: light-dark(#f6f8fa, #161b22); }
    p { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header><h1>agent-eval results</h1><p>${live ? 'Local results · updates automatically every 2 seconds' : 'Static results snapshot'}</p></header>
  <main>${runs.join('\n')}${errors.join('\n')}${runs.length === 0 ? '<p>No results found. Run a benchmark, experiment, or scenario to get started.</p>' : ''}</main>
  ${
    live
      ? `<script>
    async function refresh() {
      try {
        const response = await fetch('./__revision', {cache: 'no-store'});
        if (response.ok && await response.text() !== '${revision(results)}') location.reload();
      } catch {}
      setTimeout(refresh, 2000);
    }
    setTimeout(refresh, 2000);
  </script>`
      : ''
  }
</body>
</html>`
}

export {renderPage, revision}
