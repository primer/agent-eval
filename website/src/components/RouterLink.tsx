import {Link, useRouter, type LinkProps} from '@tanstack/react-router'
import type {ComponentProps} from 'react'

type Props = Omit<ComponentProps<'a'>, 'href'> & {href: string}

export function RouterLink({href, ...props}: Props) {
  const router = useRouter({warn: false})
  // Standalone renderers (including previews and component tests) can render anchors.
  if (!router) return <a href={href} {...props} />
  const [to, hash] = href.split('#', 2)
  return <Link to={to as LinkProps['to']} hash={hash} {...props} />
}

export type Route = string
