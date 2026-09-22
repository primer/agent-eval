'use client'

import {RouterLink} from './RouterLink'
import {Link as PrimerLink, type LinkProps as PrimerLinkProps} from '@primer/react'

type LinkProps = PrimerLinkProps & {href: string}

export function Link(props: LinkProps) {
  return <PrimerLink as={RouterLink} {...props} />
}
