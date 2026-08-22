'use client'

import {Breadcrumbs, Stack} from '@primer/react'
import type {Experiment} from '../../../../../../experiments'
import type {Route} from 'next'
import Link from 'next/link'

type TranscriptEntry = {
  id: string
  label: string
  timestamp?: string
  content: string
}

type RunResult = {
  id: string
  scenarioId: string
  treatment: string
  model: string
  reasoningEffort?: string
  testsPassed: number
  totalTests: number
  turns: number
  outputTokens: number
  premiumRequests: number
  totalApiDurationMs: number
  sessionDurationMs: number
  tests: Array<{
    fullName: string
    status: string
    description?: string
  }>
  transcript: Array<TranscriptEntry>
  conversationTurns?: Array<{
    prompt: string
    transcript: Array<TranscriptEntry>
  }>
}

type RunDetails = {
  date: string
  results: Array<RunResult>
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds} ms`
  }

  return `${(milliseconds / 1000).toFixed(1)} s`
}

function Transcript({entries}: {entries: Array<TranscriptEntry>}) {
  if (entries.length === 0) {
    return <p>No transcript messages were recorded.</p>
  }

  return (
    <ol className="list-none p-0 m-0 flex flex-col gap-3">
      {entries.map(entry => (
        <li className="border border-default rounded-2 overflow-hidden" key={entry.id}>
          <div className="bg-subtle px-3 py-2 flex justify-between gap-3">
            <strong>{entry.label}</strong>
            {entry.timestamp ? <time dateTime={entry.timestamp}>{entry.timestamp}</time> : null}
          </div>
          <pre className="m-0 p-3 whitespace-pre-wrap break-words overflow-x-auto text-body-small">{entry.content}</pre>
        </li>
      ))}
    </ol>
  )
}

type Props = {
  experiment: Experiment
  run: RunDetails
}

export function Page({experiment, run}: Props) {
  return (
    <Stack padding="normal" gap="spacious">
      <Breadcrumbs>
        <Breadcrumbs.Item as={Link} href="/experiments">
          Experiments
        </Breadcrumbs.Item>
        <Breadcrumbs.Item as={Link} href={`/experiments/${experiment.id}` as Route}>
          {experiment.id}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item selected>{run.date}</Breadcrumbs.Item>
      </Breadcrumbs>
      <div>
        <h1>
          Run <time dateTime={run.date}>{run.date}</time>
        </h1>
        <p>
          {run.results.length} results for {experiment.name}.
        </p>
      </div>
      <section>
        <h2 className="text-title-medium pb-4">Results</h2>
        <div className="flex flex-col gap-3">
          {run.results.map(result => (
            <details className="border border-default rounded-2 overflow-hidden" key={result.id}>
              <summary className="cursor-pointer bg-subtle p-4">
                <strong>{result.scenarioId}</strong>
                {' · '}
                {result.treatment}
                {' · '}
                {result.model}
                {result.reasoningEffort ? ` (${result.reasoningEffort})` : null}
              </summary>
              <div className="border-t border-default p-4 flex flex-col gap-4">
                <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 m-0">
                  <dt>Tests passed</dt>
                  <dd className="m-0">
                    {result.testsPassed}/{result.totalTests}
                  </dd>
                  <dt>Turns</dt>
                  <dd className="m-0">{result.turns}</dd>
                  <dt>Output tokens</dt>
                  <dd className="m-0">{result.outputTokens.toLocaleString('en-US')}</dd>
                  <dt>Premium requests</dt>
                  <dd className="m-0">{result.premiumRequests}</dd>
                  <dt>API time</dt>
                  <dd className="m-0">{formatDuration(result.totalApiDurationMs)}</dd>
                  <dt>Session time</dt>
                  <dd className="m-0">{formatDuration(result.sessionDurationMs)}</dd>
                </dl>
                <div>
                  <h3>Tests</h3>
                  <ul>
                    {result.tests.map(test => (
                      <li key={test.fullName}>
                        {test.fullName}: {test.status}
                        {test.description ? ` — ${test.description}` : null}
                      </li>
                    ))}
                  </ul>
                </div>
                {result.conversationTurns ? (
                  <div>
                    <h3>Conversation turns</h3>
                    <ol className="list-none p-0 m-0 flex flex-col gap-4">
                      {result.conversationTurns.map((turn, index) => (
                        <li className="border border-default rounded-2 overflow-hidden" key={index}>
                          <div className="bg-subtle px-3 py-2">
                            <strong>Turn {index + 1}</strong>
                          </div>
                          <div className="p-3 flex flex-col gap-3">
                            <div>
                              <h4 className="mt-0">Prompt</h4>
                              <pre className="m-0 whitespace-pre-wrap break-words overflow-x-auto text-body-small">
                                {turn.prompt}
                              </pre>
                            </div>
                            <div>
                              <h4>Agent transcript</h4>
                              <Transcript entries={turn.transcript} />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <div>
                    <h3>Agent transcript</h3>
                    <Transcript entries={result.transcript} />
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>
    </Stack>
  )
}

export type {RunDetails, TranscriptEntry}
