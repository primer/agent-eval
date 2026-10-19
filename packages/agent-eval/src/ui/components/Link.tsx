'use client'

import NextLink, {type LinkProps as NextLinkProps} from 'next/link'
import {Link as PrimerLink, type LinkProps as PrimerLinkProps} from '@primer/react'

type LinkProps<RouteType> = NextLinkProps<RouteType> & PrimerLinkProps

export function Link<RouteType>(props: LinkProps<RouteType>) {
  return <PrimerLink as={NextLink} {...props} />
}
