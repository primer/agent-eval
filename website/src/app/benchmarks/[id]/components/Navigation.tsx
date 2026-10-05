'use client'

import {ChecklistIcon, GearIcon, GraphIcon, HistoryIcon} from '@primer/octicons-react'
import {UnderlineNav} from '@primer/react'
import NextLink from 'next/link'
import {usePathname} from 'next/navigation'

type NavigationProps = {
  id: string
}

export function Navigation({id}: NavigationProps) {
  const pathname = usePathname()
  const benchmarkUrl = `/benchmarks/${id}`
  const links = [
    {
      href: benchmarkUrl,
      label: 'Overview',
      leadingVisual: <GraphIcon />,
    },
    {
      href: `${benchmarkUrl}/runs`,
      label: 'Runs',
      leadingVisual: <HistoryIcon />,
    },
    {
      href: `${benchmarkUrl}/capabilities`,
      label: 'Capabilities',
      leadingVisual: <ChecklistIcon />,
    },
    {
      href: `${benchmarkUrl}/config`,
      label: 'Config',
      leadingVisual: <GearIcon />,
    },
  ]

  return (
    <UnderlineNav aria-label="Benchmarks navigation" variant="flush">
      {links.map(link => {
        return (
          <UnderlineNav.Item
            key={link.href}
            as={NextLink}
            href={link.href}
            leadingVisual={link.leadingVisual}
            aria-current={pathname === link.href ? 'page' : undefined}
          >
            {link.label}
          </UnderlineNav.Item>
        )
      })}
    </UnderlineNav>
  )
}
