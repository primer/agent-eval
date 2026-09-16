'use client'

import {SkeletonBox, Spinner} from '@primer/react'
import type {ReactNode} from 'react'
import type {RunDetails} from '../../run-details'

type ResultTab = 'walkthrough' | 'checks' | 'judges' | 'transcript'
type RunResult = RunDetails['results'][number]

function BrowserFrame({children}: {children: ReactNode}) {
  return (
    <div className="border border-default rounded-md overflow-hidden w-full">
      <div className="bg-muted border-b border-default flex gap-2 p-3" aria-hidden="true">
        <span className="bg-danger-emphasis rounded-full size-3" />
        <span className="bg-attention-emphasis rounded-full size-3" />
        <span className="bg-success-emphasis rounded-full size-3" />
      </div>
      {children}
    </div>
  )
}

function MediaLoading({label}: {label: string}) {
  return (
    <div className="aspect-[8/5] w-full bg-muted flex items-center justify-center" role="status">
      <Spinner srText={`Loading ${label}`} />
    </div>
  )
}

function RunDetailsLoading({tab, result}: {tab: ResultTab; result: RunResult}) {
  if (tab === 'walkthrough') {
    const preview = result.walkthroughPreview
    if (preview.count === 0) {
      return <p>No UI walkthrough was recorded.</p>
    }
    if (preview.type === 'Video') {
      return (
        <div className="border border-default rounded-md overflow-hidden">
          <MediaLoading label="video details" />
        </div>
      )
    }
    const frames = Array.from({length: preview.count}, (_, index) => {
      return (
        <BrowserFrame key={index}>
          <MediaLoading label={`walkthrough image ${index + 1}`} />
        </BrowserFrame>
      )
    })
    return preview.type === 'Screenshots' ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{frames}</div>
    ) : (
      frames
    )
  }

  return (
    <div className={`min-h-64 ${tab === 'transcript' ? 'max-w-3xl mx-auto' : ''}`} role="status">
      <div className="flex items-center gap-2 text-muted mb-4">
        <Spinner size="small" srText={null} />
        <span>Loading {tab}...</span>
      </div>
      <div className="flex flex-col gap-4" aria-hidden="true">
        {Array.from({length: 3}, (_, index) => {
          return (
            <div className="flex gap-3" key={index}>
              {tab === 'transcript' ? <SkeletonBox width={32} height={32} className="rounded-full shrink-0" /> : null}
              <div className="border border-default rounded-md p-4 flex-1 flex flex-col gap-3">
                <SkeletonBox height={16} width="35%" />
                <SkeletonBox height={12} width="90%" />
                {tab !== 'checks' ? <SkeletonBox height={12} width="70%" /> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export {BrowserFrame, MediaLoading, RunDetailsLoading}
export type {ResultTab}
