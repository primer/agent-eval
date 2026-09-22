'use client'

import {FormControl, Select, Stack} from '@primer/react'
import {useEffect, useState} from 'react'
import {RunDetailsView} from '../app/components/RunDetailsView'
import type {LocalSnapshot} from './snapshot'

export function LocalResults({initial, live, dataUrl}: {initial: LocalSnapshot; live: boolean; dataUrl: string}) {
  const [snapshot, setSnapshot] = useState(initial)
  const [selected, setSelected] = useState(initial.runs[0]?.file ?? '')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!live) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const response = await fetch(dataUrl, {cache: 'no-store', signal: controller.signal})
        if (!response.ok) throw new Error(`Results refresh failed (${response.status})`)
        const next: LocalSnapshot = await response.json()
        if (!controller.signal.aborted) {
          setSnapshot(current => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
          setError('')
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 2000)
    }
    timer = setTimeout(refresh, 2000)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [live, dataUrl])
  const run = snapshot.runs.find(candidate => candidate.file === selected) ?? snapshot.runs[0]
  return (
    <>
      <Stack padding="normal">
        <div className="w-full max-w-screen-xl mx-auto">
          <h1 className="text-title-large">Local results</h1>
          {live ? <p className="text-muted">Results refresh automatically.</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          {snapshot.errors.map(entry => (
            <p role="alert" key={entry.file}>
              {entry.file}: {entry.message}
            </p>
          ))}
          {run ? (
            <FormControl>
              <FormControl.Label>Run</FormControl.Label>
              <Select value={run.file} onChange={event => setSelected(event.currentTarget.value)}>
                {snapshot.runs.map(entry => (
                  <Select.Option key={entry.file} value={entry.file}>
                    {entry.id} · {entry.kind} · {entry.file}
                  </Select.Option>
                ))}
              </Select>
            </FormControl>
          ) : (
            <p>No result bundles found.</p>
          )}
        </div>
      </Stack>
      {run ? (
        <RunDetailsView
          key={run.file}
          resource={{id: run.id, name: run.id, collectionLabel: 'Local results', collectionHref: '/', href: '/'}}
          run={run.details}
        />
      ) : null}
    </>
  )
}
