import NextLink from 'next/link'
import {Link as PrimerLink} from '@primer/react'
import type {ComponentPropsWithoutRef} from 'react'
import type {Route} from 'next'

type LinkProps<T extends string> = Omit<ComponentPropsWithoutRef<typeof NextLink>, 'href'> & {
  href: Route<T>
}

export function Link<T extends string>(props: LinkProps<T>) {
  // @ts-expect-error
  return <PrimerLink as={NextLink} {...props} />
}
