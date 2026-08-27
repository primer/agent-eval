'use client'

import {CheckCircleFillIcon, CopilotIcon, PersonIcon, XCircleFillIcon} from '@primer/octicons-react'
import {Breadcrumbs, FormControl, Select, Stack, UnderlineNav} from '@primer/react'
import type {Experiment} from '../../../../../../experiments'
import type {Route} from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {useState} from 'react'
import type {WalkthroughDataUrl} from '../page'

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
  walkthrough: WalkthroughDataUrl
}

type RunDetails = {
  date: string
  results: Array<RunResult>
}

type ScenarioResultGroup = {
  scenarioId: string
  results: [RunResult, ...Array<RunResult>]
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
    <ol className="list-none p-0 m-0 flex flex-col gap-4">
      {entries.map(entry => {
        const isUser = entry.label === 'User'
        const isAssistant = entry.label === 'Assistant'

        return (
          <li className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`} key={entry.id}>
            <span
              className={`rounded-full size-8 shrink-0 flex items-center justify-center ${
                isUser ? 'bg-accent-emphasis text-on-emphasis' : 'bg-neutral-muted text-default'
              }`}
            >
              {isUser ? <PersonIcon /> : <CopilotIcon />}
            </span>
            <div
              className={`border rounded-lg min-w-0 overflow-hidden ${
                isUser
                  ? 'bg-accent-muted border-accent-muted'
                  : isAssistant
                    ? 'bg-default border-default flex-1'
                    : 'bg-muted border-muted flex-1'
              }`}
            >
              <div className="px-3 pt-3 flex items-baseline justify-between gap-3">
                <strong className="text-body-medium">{entry.label}</strong>
                {entry.timestamp ? (
                  <time className="text-caption text-muted whitespace-nowrap" dateTime={entry.timestamp}>
                    {entry.timestamp}
                  </time>
                ) : null}
              </div>
              <pre className="font-sans m-0 px-3 pb-3 pt-2 whitespace-pre-wrap break-words overflow-x-auto text-body-medium">
                {entry.content}
              </pre>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function BrowserScreenshot({alt, source}: {alt: string; source: string}) {
  return (
    <div className="border border-default rounded-md overflow-hidden w-fit max-w-full">
      <div className="bg-muted border-b border-default flex gap-2 p-3" aria-hidden="true">
        <span className="bg-danger-emphasis rounded-full size-3" />
        <span className="bg-attention-emphasis rounded-full size-3" />
        <span className="bg-success-emphasis rounded-full size-3" />
      </div>
      <Image alt={alt} className="block max-w-full h-auto" height={900} src={source} unoptimized width={1440} />
    </div>
  )
}

function UiWalkthrough({scenarioId, walkthrough}: {scenarioId: string; walkthrough: WalkthroughDataUrl}) {
  if (walkthrough.type === 'Video') {
    return (
      <video
        className="border border-default rounded-2 w-full h-auto"
        controls
        height={900}
        src={walkthrough.video}
        width={1440}
      />
    )
  }

  if (walkthrough.type === 'Screenshots') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {walkthrough.screenshots.map((source, index) => (
          <BrowserScreenshot alt={`UI walkthrough step ${index + 1} for ${scenarioId}`} key={source} source={source} />
        ))}
      </div>
    )
  }

  if (walkthrough.type === 'Screenshot') {
    return <BrowserScreenshot alt={`UI walkthrough for ${scenarioId}`} source={walkthrough.screenshot} />
  }

  return <p>No UI walkthrough was recorded.</p>
}

type ResultTab = 'walkthrough' | 'tests' | 'transcript'

function ResultTabs({index, result}: {index: number; result: RunResult}) {
  const [selectedTab, setSelectedTab] = useState<ResultTab>('walkthrough')
  const tabIds = {
    walkthrough: `result-${index}-walkthrough-tab`,
    tests: `result-${index}-tests-tab`,
    transcript: `result-${index}-transcript-tab`,
  }
  const panelId = `result-${index}-${selectedTab}-panel`

  return (
    <section className="bg-default border border-default rounded-lg overflow-hidden">
      <UnderlineNav aria-label={`${result.scenarioId} result details`}>
        <UnderlineNav.Item
          aria-current={selectedTab === 'walkthrough' ? 'page' : undefined}
          href={`#result-${index}-walkthrough-panel`}
          id={tabIds.walkthrough}
          onSelect={event => {
            event.preventDefault()
            setSelectedTab('walkthrough')
          }}
        >
          Walkthrough
        </UnderlineNav.Item>
        <UnderlineNav.Item
          aria-current={selectedTab === 'tests' ? 'page' : undefined}
          counter={result.tests.length}
          href={`#result-${index}-tests-panel`}
          id={tabIds.tests}
          onSelect={event => {
            event.preventDefault()
            setSelectedTab('tests')
          }}
        >
          Tests
        </UnderlineNav.Item>
        <UnderlineNav.Item
          aria-current={selectedTab === 'transcript' ? 'page' : undefined}
          counter={result.transcript.length}
          href={`#result-${index}-transcript-panel`}
          id={tabIds.transcript}
          onSelect={event => {
            event.preventDefault()
            setSelectedTab('transcript')
          }}
        >
          Transcript
        </UnderlineNav.Item>
      </UnderlineNav>
      <div aria-labelledby={tabIds[selectedTab]} className="p-4" id={panelId} role="region">
        {selectedTab === 'walkthrough' ? (
          <UiWalkthrough scenarioId={result.scenarioId} walkthrough={result.walkthrough} />
        ) : null}
        {selectedTab === 'tests' ? (
          <ul className="list-none p-0 m-0">
            {result.tests.map(test => {
              const isPassed = test.status === 'passed'

              return (
                <li
                  className="border-t border-default py-3 first:border-t-0 first:pt-0 last:pb-0 flex items-start gap-3"
                  key={test.fullName}
                >
                  <span className={`mt-1 shrink-0 ${isPassed ? 'text-success' : 'text-danger'}`}>
                    {isPassed ? <CheckCircleFillIcon /> : <XCircleFillIcon />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-body-medium">{test.fullName}</span>
                      <span
                        className={`rounded-full px-2 py-1 text-caption whitespace-nowrap ${
                          isPassed ? 'bg-success-muted text-success' : 'bg-danger-muted text-danger'
                        }`}
                      >
                        {test.status}
                      </span>
                    </div>
                    {test.description ? <p className="text-muted mt-1 mb-0">{test.description}</p> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
        {selectedTab === 'transcript' ? (
          <div className="w-full max-w-3xl mx-auto">
            <Transcript entries={result.transcript} />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function getResultLabel(result: RunResult): string {
  const model = result.reasoningEffort ? `${result.model} (${result.reasoningEffort})` : result.model
  return `${model} · ${result.treatment}`
}

function groupResultsByScenario(results: Array<RunResult>): Array<ScenarioResultGroup> {
  const groups = new Map<string, ScenarioResultGroup>()

  for (const result of results) {
    const group = groups.get(result.scenarioId)
    if (group) {
      group.results.push(result)
    } else {
      groups.set(result.scenarioId, {
        scenarioId: result.scenarioId,
        results: [result],
      })
    }
  }

  return Array.from(groups.values())
}

function ScenarioResults({group, index}: {group: ScenarioResultGroup; index: number}) {
  const [selectedResultId, setSelectedResultId] = useState(group.results[0].id)
  const selectedResult = group.results.find(result => {
    return result.id === selectedResultId
  })

  if (!selectedResult) {
    throw new Error(`Selected result "${selectedResultId}" was not found for scenario "${group.scenarioId}"`)
  }

  const resultHeadingId = `result-${index}-heading`
  const summaryHeadingId = `result-${index}-summary-heading`

  return (
    <article aria-labelledby={resultHeadingId} className="flex flex-col gap-4">
      <header className="border-b border-default pb-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <h3 className="text-title-medium m-0" id={resultHeadingId}>
          {group.scenarioId}
        </h3>
        <FormControl>
          <FormControl.Label>Model and treatment</FormControl.Label>
          <Select
            value={selectedResultId}
            onChange={event => {
              setSelectedResultId(event.currentTarget.value)
            }}
          >
            {group.results.map(result => {
              return (
                <Select.Option key={result.id} value={result.id}>
                  {getResultLabel(result)}
                </Select.Option>
              )
            })}
          </Select>
        </FormControl>
      </header>
      <div className="flex flex-col gap-4">
        <section className="bg-default border border-default rounded-lg p-4" aria-labelledby={summaryHeadingId}>
          <h4 className="text-title-small mt-0 mb-3" id={summaryHeadingId}>
            Run summary
          </h4>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 m-0">
            <div className="bg-muted rounded-md p-3">
              <dt className="text-caption text-muted">Tests passed</dt>
              <dd className="text-title-small m-0">
                {selectedResult.testsPassed}/{selectedResult.totalTests}
              </dd>
            </div>
            <div className="bg-muted rounded-md p-3">
              <dt className="text-caption text-muted">Turns</dt>
              <dd className="text-title-small m-0">{selectedResult.turns}</dd>
            </div>
            <div className="bg-muted rounded-md p-3">
              <dt className="text-caption text-muted">Output tokens</dt>
              <dd className="text-title-small m-0">{selectedResult.outputTokens.toLocaleString('en-US')}</dd>
            </div>
            <div className="bg-muted rounded-md p-3">
              <dt className="text-caption text-muted">Premium requests</dt>
              <dd className="text-title-small m-0">{selectedResult.premiumRequests}</dd>
            </div>
            <div className="bg-muted rounded-md p-3">
              <dt className="text-caption text-muted">API time</dt>
              <dd className="text-title-small m-0">{formatDuration(selectedResult.totalApiDurationMs)}</dd>
            </div>
            <div className="bg-muted rounded-md p-3">
              <dt className="text-caption text-muted">Session time</dt>
              <dd className="text-title-small m-0">{formatDuration(selectedResult.sessionDurationMs)}</dd>
            </div>
          </dl>
        </section>
        <ResultTabs index={index} result={selectedResult} />
      </div>
    </article>
  )
}

type Props = {
  experiment: Experiment
  run: RunDetails
}

export function Page({experiment, run}: Props) {
  const resultGroups = groupResultsByScenario(run.results)

  return (
    <Stack padding="normal">
      <div className="w-full max-w-screen-xl mx-auto flex flex-col gap-6">
        <Breadcrumbs>
          <Breadcrumbs.Item as={Link} href="/experiments">
            Experiments
          </Breadcrumbs.Item>
          <Breadcrumbs.Item as={Link} href={`/experiments/${experiment.id}` as Route}>
            {experiment.id}
          </Breadcrumbs.Item>
          <Breadcrumbs.Item selected>{run.date}</Breadcrumbs.Item>
        </Breadcrumbs>
        <header className="border-b border-default pb-4">
          <h1 className="text-title-large m-0">
            Run <time dateTime={run.date}>{run.date}</time>
          </h1>
          <p className="text-muted mt-2 mb-0">
            {run.results.length} results for {experiment.name}.
          </p>
        </header>
        <section aria-labelledby="results-heading">
          <h2 className="text-title-medium mt-0 mb-4" id="results-heading">
            Results
          </h2>
          <div className="flex flex-col gap-8">
            {resultGroups.map((group, index) => {
              return <ScenarioResults group={group} index={index} key={group.scenarioId} />
            })}
          </div>
        </section>
      </div>
    </Stack>
  )
}

export type {RunDetails, TranscriptEntry}
