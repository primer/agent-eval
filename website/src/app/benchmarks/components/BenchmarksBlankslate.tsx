'use client'

import {Blankslate} from '@primer/react/experimental'
import {AlertIcon} from '@primer/octicons-react'

export function BenchmarksBlankslate({directory}: {directory: string}) {
  return (
    <Blankslate border>
      <Blankslate.Visual>
        <AlertIcon size="medium" />
      </Blankslate.Visual>
      <Blankslate.Heading>No benchmarks available</Blankslate.Heading>
      <Blankslate.Description>
        Unable to find any benchmarks at: <code>{directory}</code>
      </Blankslate.Description>
    </Blankslate>
  )
}
