'use client'

import {BaseStyles as PrimerBaseStyles} from '@primer/react'

export function BaseStyles({children}: {children: React.ReactNode}) {
  return <PrimerBaseStyles>{children}</PrimerBaseStyles>
}
