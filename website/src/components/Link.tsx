'use client'

import NextLink, {type LinkProps as NextLinkProps} from 'next/link'
import {Link as PrimerLink, type LinkProps as PrimerLinkProps} from '@primer/react'

type LinkProps = NextLinkProps & PrimerLinkProps

export function Link(props: LinkProps) {
  return <PrimerLink as={NextLink} {...props} />
}
