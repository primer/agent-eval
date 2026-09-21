'use client'

import {Button, Spinner} from '@primer/react'
import {Blankslate} from '@primer/react/experimental'
import {ChevronLeftIcon, ChevronRightIcon} from '@primer/octicons-react'
import Image from 'next/image'
import {useLayoutEffect, useRef, useState} from 'react'
import type {WalkthroughUrls} from '../../run-details'
import {BrowserFrame, MediaLoading} from './RunDetailsLoading'

function MediaError({label, retry}: {label: string; retry: () => void}) {
  return (
    <div className="aspect-[8/5] w-full bg-muted flex flex-col items-center justify-center gap-3 p-4" role="alert">
      <p className="m-0">Could not load {label}.</p>
      <Button onClick={retry}>Retry</Button>
    </div>
  )
}

function BrowserScreenshot({alt, source, eager}: {alt: string; source: string; eager: boolean}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const container = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState<'eager' | 'lazy' | null>(eager ? 'eager' : null)

  useLayoutEffect(() => {
    const element = container.current
    if (!element) {
      return
    }
    const bounds = element.getBoundingClientRect()
    if (eager || (bounds.top < window.innerHeight && bounds.bottom > 0)) {
      setLoading('eager')
      return
    }
    setLoading('lazy')
    const observer = new IntersectionObserver(entries => {
      if (
        entries.some(entry => {
          return entry.isIntersecting
        })
      ) {
        setLoading('eager')
        observer.disconnect()
      }
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [eager])

  return (
    <BrowserFrame>
      <div className="relative" ref={container}>
        {status === 'error' ? (
          <MediaError
            label={alt}
            retry={() => {
              setStatus('loading')
            }}
          />
        ) : (
          <>
            {status === 'loading' ? <MediaLoading label={alt} /> : null}
            {loading !== null ? (
              <Image
                alt={alt}
                className={`block w-full h-auto ${status === 'loading' ? 'absolute inset-0 opacity-0' : ''}`}
                height={900}
                loading={loading}
                onLoad={() => {
                  setStatus('loaded')
                }}
                onError={() => {
                  setStatus('error')
                }}
                src={source}
                unoptimized
                width={1440}
              />
            ) : null}
          </>
        )}
      </div>
    </BrowserFrame>
  )
}

function WalkthroughVideo({source}: {source: string}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  return (
    <div className="relative border border-default rounded-md overflow-hidden">
      {status === 'error' ? (
        <MediaError
          label="walkthrough video"
          retry={() => {
            setStatus('idle')
          }}
        />
      ) : (
        <>
          <video
            className="block aspect-[8/5] w-full h-auto"
            controls
            height={900}
            onPlay={() => {
              setStatus('loading')
            }}
            onWaiting={() => {
              setStatus('loading')
            }}
            onPlaying={() => {
              setStatus('ready')
            }}
            onPause={() => {
              setStatus('idle')
            }}
            onCanPlay={() => {
              setStatus('ready')
            }}
            onError={() => {
              setStatus('error')
            }}
            preload="none"
            src={source}
            width={1440}
          />
          {status === 'loading' ? (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" role="status">
              <div className="bg-default rounded-full p-3">
                <Spinner srText="Loading walkthrough video" />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function ScreenshotCarousel({
  scenarioId,
  screenshots,
  eager,
}: {
  scenarioId: string
  screenshots: Array<string>
  eager: boolean
}) {
  const [index, setIndex] = useState(0)
  const source = screenshots[index]
  if (!source) {
    return (
      <Blankslate border>
        <Blankslate.Heading as="h3">No UI walkthrough</Blankslate.Heading>
        <Blankslate.Description>No UI walkthrough was recorded for this scenario.</Blankslate.Description>
      </Blankslate>
    )
  }

  return (
    <section aria-label={`UI walkthrough for ${scenarioId}`} aria-roledescription="carousel" className="w-full">
      {screenshots.length > 1 ? (
        <div className="flex items-center justify-between gap-3 mb-3">
          <Button
            aria-label="Previous image"
            disabled={index === 0}
            leadingVisual={ChevronLeftIcon}
            onClick={() => {
              setIndex(index - 1)
            }}
          >
            Previous
          </Button>
          <span aria-live="polite" aria-atomic="true" role="status" className="text-muted text-body-small">
            {`Image ${index + 1} of ${screenshots.length}`}
          </span>
          <Button
            aria-label="Next image"
            disabled={index === screenshots.length - 1}
            trailingVisual={ChevronRightIcon}
            onClick={() => {
              setIndex(index + 1)
            }}
          >
            Next
          </Button>
        </div>
      ) : null}
      <div role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${screenshots.length}`}>
        <BrowserScreenshot
          alt={`UI walkthrough step ${index + 1} for ${scenarioId}`}
          eager={eager || index > 0}
          key={source}
          source={source}
        />
      </div>
    </section>
  )
}

function UiWalkthrough({
  scenarioId,
  walkthrough,
  eager,
}: {
  scenarioId: string
  walkthrough: WalkthroughUrls
  eager: boolean
}) {
  if (walkthrough.type === 'Video') {
    return <WalkthroughVideo key={walkthrough.video} source={walkthrough.video} />
  }
  if (walkthrough.type === 'Screenshots') {
    return (
      <ScreenshotCarousel
        eager={eager}
        key={JSON.stringify([scenarioId, walkthrough.screenshots])}
        scenarioId={scenarioId}
        screenshots={walkthrough.screenshots}
      />
    )
  }
  if (walkthrough.type === 'Screenshot') {
    return (
      <BrowserScreenshot
        alt={`UI walkthrough for ${scenarioId}`}
        eager={eager}
        key={walkthrough.screenshot}
        source={walkthrough.screenshot}
      />
    )
  }
  return <p>No UI walkthrough was recorded.</p>
}

export {UiWalkthrough}
