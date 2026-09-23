'use client'

import {
  ChevronRightIcon,
  CommentIcon,
  FileDirectoryIcon,
  PersonIcon,
  SearchIcon,
  TerminalIcon,
  ViewFilesIcon,
} from '@primer/octicons-react'
import {Details, Stack, Text} from '@primer/react'
import {useId} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {TranscriptEntry} from '../../run-details'
import styles from './Transcript.module.css'

function MarkdownContent({content}: {content: string}) {
  const id = useId()
  const footnoteLabelId = `${id}-footnote-label`

  return (
    <div className={styles.markdown}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        remarkRehypeOptions={{clobberPrefix: `${id}-`}}
        skipHtml
        components={{
          a({node, ...props}) {
            return (
              <a
                {...props}
                aria-describedby={
                  node?.properties.dataFootnoteRef !== undefined ? footnoteLabelId : props['aria-describedby']
                }
              />
            )
          },
          h2({node, ...props}) {
            return <h2 {...props} id={node?.properties.id === 'footnote-label' ? footnoteLabelId : props.id} />
          },
          table({children}) {
            return (
              <div className={styles.tableWrapper}>
                <table>{children}</table>
              </div>
            )
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}

function getToolIcon(name: string) {
  switch (name) {
    case 'glob':
      return FileDirectoryIcon
    case 'rg':
    case 'grep':
      return SearchIcon
    case 'view':
      return ViewFilesIcon
    default:
      return TerminalIcon
  }
}

export function Transcript({entries}: {entries: Array<TranscriptEntry>}) {
  if (entries.length === 0) {
    return <p>No transcript messages were recorded.</p>
  }

  return (
    <Stack as="ol" gap="condensed" className="list-none p-0 m-0">
      {entries.map(entry => {
        const isUser = entry.label === 'User'
        const isAssistant = entry.label === 'Assistant'
        const isSummary = entry.label === 'Summary'
        const isTool = entry.label.startsWith('Tool call: ') || entry.label.startsWith('Tool result: ')
        const isThinking = entry.label === 'Reasoning'
        const timestamp = entry.timestamp ? (
          <time className="sr-only" dateTime={entry.timestamp}>
            {entry.timestamp}
          </time>
        ) : null

        if (isTool || isThinking) {
          const ToolIcon = isThinking
            ? CommentIcon
            : getToolIcon(entry.toolCall?.name ?? entry.label.replace(/^Tool (?:call|result): /, ''))

          return (
            <li key={entry.id}>
              <Details className="group" open={isThinking}>
                <Details.Summary className="group/tool flex items-center gap-2 rounded-md py-0.5 text-muted cursor-pointer hover:text-default">
                  <span className="relative flex size-4 shrink-0 items-center justify-center">
                    <ToolIcon className="group-hover/tool:opacity-0 group-focus-visible/tool:opacity-0" size={16} />
                    <ChevronRightIcon className="absolute opacity-0 group-hover/tool:opacity-100 group-focus-visible/tool:opacity-100 group-open:rotate-90" />
                  </span>
                  <Text size="small" className="min-w-0 break-words">
                    {isThinking ? 'Thinking' : entry.label}
                  </Text>
                  {timestamp}
                </Details.Summary>
                {isThinking ? (
                  <Text as="div" size="small" className="mt-1 ml-6 italic text-muted break-words">
                    <MarkdownContent content={entry.content} />
                  </Text>
                ) : (
                  <pre className="m-0 mt-1 ml-6 p-3 bg-default border border-default rounded-md max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-body-small">
                    {entry.content}
                  </pre>
                )}
              </Details>
            </li>
          )
        }

        return (
          <li className={`flex items-start gap-3 py-2 ${isUser ? 'justify-end' : ''}`} key={entry.id}>
            <div className={`min-w-0 ${isUser ? 'max-w-[85%] bg-muted rounded-xl px-4 py-3' : 'flex-1'}`}>
              <Text as="span" size="small" className={isUser || isAssistant ? 'sr-only' : 'text-muted block mb-2'}>
                {entry.label}
              </Text>
              {timestamp}
              {isAssistant || isSummary ? (
                <Text as="div" size="medium" className={`break-words ${isSummary ? 'text-muted' : ''}`}>
                  <MarkdownContent content={entry.content} />
                </Text>
              ) : (
                <Text
                  as="p"
                  size="medium"
                  whiteSpace="pre-wrap"
                  className={`m-0 break-words ${!isUser ? 'text-muted' : ''}`}
                >
                  {entry.content}
                </Text>
              )}
            </div>
            {isUser ? (
              <span className="rounded-full size-8 shrink-0 flex items-center justify-center bg-muted text-muted mt-2">
                <PersonIcon size={20} />
              </span>
            ) : null}
          </li>
        )
      })}
    </Stack>
  )
}
