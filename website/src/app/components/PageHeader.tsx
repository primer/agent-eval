'use client'

import {MarkGithubIcon} from '@primer/octicons-react'
import Link from 'next/link'
import {UnderlineNav} from '@primer/react'
import {usePathname} from 'next/navigation'
import styles from './PageHeader.module.css'

export function PageHeader() {
  const pathname = usePathname()

  return (
    <>
      <header className="pt-3 text-default bg-inset flex text-body-medium  flex-wrap">
        <Link className={`${styles.brandLink} flex gap-x-3 items-center px-6`} href="/">
          <MarkGithubIcon size={32} />
          <span>
            primer<span className="px-2 text-body-small">/</span>
            <span className="font-semibold">agent-eval</span>
          </span>
        </Link>
        <UnderlineNav aria-label="Agent eval" className={`${styles.navigation} grow shrink basis-full`}>
          <UnderlineNav.Item as={Link} href="/" aria-current={pathname === '/' ? 'page' : undefined}>
            Overview
          </UnderlineNav.Item>
          <UnderlineNav.Item
            as={Link}
            href="/baseline"
            aria-current={pathname.startsWith('/baseline') ? 'page' : undefined}
          >
            Baseline
          </UnderlineNav.Item>
          <UnderlineNav.Item
            as={Link}
            href="/experiments"
            aria-current={pathname.startsWith('/experiments') ? 'page' : undefined}
          >
            Experiments
          </UnderlineNav.Item>
          <UnderlineNav.Item
            as={Link}
            href="/benchmarks"
            aria-current={pathname.startsWith('/benchmarks') ? 'page' : undefined}
          >
            Benchmarks
          </UnderlineNav.Item>
          <UnderlineNav.Item
            as={Link}
            href="/scenarios"
            aria-current={pathname.startsWith('/scenarios') ? 'page' : undefined}
          >
            Scenarios
          </UnderlineNav.Item>
        </UnderlineNav>
      </header>
    </>
  )
}
