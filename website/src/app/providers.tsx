'use client'

import {BaseStyles} from '@primer/react'
import type {PropsWithChildren} from 'react'

export function Providers({children}: PropsWithChildren) {
  return <BaseStyles>{children}</BaseStyles>
}
