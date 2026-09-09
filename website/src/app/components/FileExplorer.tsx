'use client'

import {FileIcon, FileDirectoryIcon} from '@primer/octicons-react'
import {Button, FormControl, TextInput} from '@primer/react'
import {useEffect, useId, useState} from 'react'
import type {WorkspaceFile, WorkspaceFiles} from '../../workspace-files'

function FileList({
  files,
  prefix = '',
  selectedPath,
  onSelect,
}: {
  files: Array<WorkspaceFile>
  prefix?: string
  selectedPath?: string
  onSelect: (file: WorkspaceFile) => void
}) {
  const directories = new Map<string, Array<WorkspaceFile>>()
  const children: Array<WorkspaceFile> = []
  for (const file of files) {
    const name = file.path.slice(prefix.length)
    const slash = name.indexOf('/')
    if (slash === -1) {
      children.push(file)
    } else {
      const directory = name.slice(0, slash)
      const group = directories.get(directory) ?? []
      group.push(file)
      directories.set(directory, group)
    }
  }
  return (
    <ul className="list-none m-0 pl-3">
      {[...directories].map(([name, group]) => (
        <li key={name}>
          <details open>
            <summary className="cursor-pointer py-1 whitespace-nowrap">
              <FileDirectoryIcon /> {name}
            </summary>
            <FileList files={group} prefix={`${prefix}${name}/`} selectedPath={selectedPath} onSelect={onSelect} />
          </details>
        </li>
      ))}
      {children.map(file => (
        <li key={file.path}>
          <button
            aria-current={selectedPath === file.path ? 'true' : undefined}
            className={`border-0 rounded-md px-2 py-1 text-left whitespace-nowrap cursor-pointer w-full ${
              selectedPath === file.path ? 'bg-accent-muted text-accent' : 'bg-transparent text-default'
            }`}
            title={file.path}
            type="button"
            onClick={() => onSelect(file)}
          >
            <FileIcon /> {file.path.slice(prefix.length)}
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function FileExplorer({url}: {url: string}) {
  const [data, setData] = useState<WorkspaceFiles | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  const headingId = useId()

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(url, {signal: controller.signal})
        if (!response.ok) {
          throw new Error('Unable to load files')
        }
        const files: WorkspaceFiles = await response.json()
        if (!controller.signal.aborted) {
          setData(files)
        }
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true)
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [url, attempt])

  if (failed) {
    return (
      <div>
        <p role="alert">Unable to load workspace files.</p>
        <Button
          onClick={() => {
            setFailed(false)
            setAttempt(attempt + 1)
          }}
        >
          Retry
        </Button>
      </div>
    )
  }
  if (!data) {
    return <p role="status">Loading workspace files…</p>
  }
  if (data.files.length === 0) {
    return <p>No workspace files are available for this result.</p>
  }
  const files = data.files.filter(file => file.path.toLowerCase().includes(query.toLowerCase()))
  return (
    <div>
      {data.truncated ? <p role="status">Only the first 1,000 files are shown.</p> : null}
      <div className="flex flex-col sm:flex-row border border-default rounded-md overflow-hidden">
        <nav
          aria-label="Workspace files"
          className="sm:w-72 shrink-0 border-b sm:border-b-0 sm:border-r border-default bg-muted"
        >
          <div className="p-3">
            <FormControl>
              <FormControl.Label>Find a file</FormControl.Label>
              <TextInput block value={query} onChange={event => setQuery(event.currentTarget.value)} />
            </FormControl>
          </div>
          <div className="overflow-auto max-h-64 sm:max-h-96 p-2">
            {files.length ? (
              <FileList files={files} selectedPath={selected?.path} onSelect={setSelected} />
            ) : (
              <p className="px-2">No matching files.</p>
            )}
          </div>
        </nav>
        <section aria-labelledby={headingId} className="min-w-0 flex-1">
          <h3 className="m-0 p-3 border-b border-default text-body-medium break-all" id={headingId}>
            {selected?.path ?? 'File preview'}
          </h3>
          {selected?.content !== undefined ? (
            <pre className="m-0 p-4 overflow-auto max-h-96 text-body-small" tabIndex={0}>
              <code>{selected.content || '(Empty file)'}</code>
            </pre>
          ) : (
            <p className="p-4 m-0 text-muted">{selected?.unavailable ?? 'Select a file to preview its contents.'}</p>
          )}
        </section>
      </div>
    </div>
  )
}
