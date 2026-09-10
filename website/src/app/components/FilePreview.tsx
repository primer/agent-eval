'use client'

import {Button} from '@primer/react'
import {Fragment, useEffect, useState} from 'react'
import {isFilePreviewData, type FilePreviewData, type FilePreviewReference} from '../../file-preview'
import type {WorkspaceFile} from '../../workspace-files'
import styles from './FileExplorer.module.css'

type PreviewState = {type: 'loading'} | {type: 'error'; message: string} | {type: 'loaded'; preview: FilePreviewData}

function FilePreviewContent({filepath, preview}: {filepath: string; preview: FilePreviewData}) {
  if (preview.type === 'unavailable') {
    return <p className="p-3 m-0 text-muted">{preview.reason}</p>
  }
  if (preview.content.length === 0) {
    return <p className="p-3 m-0 text-muted">This file is empty.</p>
  }
  if (preview.type === 'text') {
    return (
      <pre aria-label={filepath} className={styles.code} tabIndex={0}>
        <code>{preview.content}</code>
      </pre>
    )
  }

  let previousEnd = 0
  const highlighted = preview.tokens.map((token, index) => {
    // Token offsets let us retain the original line endings and blank lines.
    const gap = preview.content.slice(previousEnd, token.offset)
    previousEnd = token.offset + token.content.length
    return (
      <Fragment key={index}>
        {gap}
        <span style={token.style}>{token.content}</span>
      </Fragment>
    )
  })

  return (
    <pre aria-label={filepath} className={styles.code} tabIndex={0}>
      <code>
        {highlighted}
        {preview.content.slice(previousEnd)}
      </code>
    </pre>
  )
}

function RemoteFilePreview({filepath, url}: {filepath: string; url: string}) {
  const [state, setState] = useState<PreviewState>({type: 'loading'})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadPreview() {
      try {
        const response = await fetch(url, {signal: controller.signal})
        if (!response.ok) {
          throw new Error(`The server returned HTTP ${response.status}.`)
        }
        const preview: unknown = await response.json()
        if (!isFilePreviewData(preview)) {
          throw new Error('The server returned an invalid file preview.')
        }
        if (!controller.signal.aborted) {
          setState({type: 'loaded', preview})
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error)
          setState({type: 'error', message: `Unable to load this file. ${message}`})
        }
      }
    }

    void loadPreview()
    return () => {
      controller.abort()
    }
  }, [url, attempt])

  if (state.type === 'loading') {
    return (
      <p className="p-3 m-0 text-muted" role="status">
        Loading file preview...
      </p>
    )
  }
  if (state.type === 'error') {
    return (
      <div className="p-3">
        <p className="mt-0" role="alert">
          {state.message}
        </p>
        <Button
          onClick={() => {
            setState({type: 'loading'})
            setAttempt(attempt + 1)
          }}
        >
          Retry
        </Button>
      </div>
    )
  }
  return <FilePreviewContent filepath={filepath} preview={state.preview} />
}

function FilePreview({file}: {file: WorkspaceFile<FilePreviewReference>}) {
  if (file.preview.type === 'remote') {
    return <RemoteFilePreview filepath={file.path} key={file.preview.url} url={file.preview.url} />
  }
  return <FilePreviewContent filepath={file.path} preview={file.preview} />
}

export {FilePreview, FilePreviewContent}
