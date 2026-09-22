'use client'

import {BaseStyles as PrimerBaseStyles} from '@primer/react'

// Keep the full Primer client barrel out of the server component boundary.
export function BaseStyles({children}: {children: React.ReactNode}) {
  return <PrimerBaseStyles>{children}</PrimerBaseStyles>
}
