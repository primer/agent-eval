import Link from 'next/link'
import {VisuallyHidden} from '@primer/react'
import {MarkGithubIcon} from '@primer/octicons-react'
import {exhaustiveCheck} from '../../exhaustive'
import classes from './PageHeader.module.css'
import type {PropsWithChildren} from 'react'
import {MenuButton} from './MenuButton'

type PageHeaderProps = PropsWithChildren<
  | {
      category: 'benchmarks'
      benchmark?: {
        label: string
        href: string
      }
    }
  | {
      category: 'experiments'
      experiment?: string
    }
  | {
      category: 'scenarios'
      scenario?: string
    }
  | {
      category?: never
      scenario?: never
    }
>

export function PageHeader(props: PageHeaderProps) {
  const links = []

  if ('category' in props) {
    if (props.category === 'benchmarks') {
      links.push({
        href: '/benchmarks',
        label: 'Benchmarks',
      } as const)

      if (props.benchmark) {
        links.push({
          href: props.benchmark.href,
          label: props.benchmark.label,
        } as const)
      }
    } else if (props.category === 'experiments') {
      links.push({
        href: '/experiments',
        label: 'Experiments',
      } as const)
    } else if (props.category === 'scenarios') {
      links.push({
        href: '/scenarios',
        label: 'Scenarios',
      } as const)
    } else {
      exhaustiveCheck(props)
    }
  } else {
    links.push({
      href: '/',
      label: 'agent-eval',
    } as const)
  }

  return (
    <header className={classes.Header}>
      <div className="flex gap-x-4 items-center">
        <MenuButton />
        <nav>
          <ul className={classes.List}>
            <li className={classes.Item}>
              <Link className={classes.Logo} href="/">
                <MarkGithubIcon size="medium" />
                <VisuallyHidden>Home</VisuallyHidden>
              </Link>
            </li>
            {links.map((link, index) => {
              const hasEmphasis = index === links.length - 1
              const hasSeparator = index < links.length - 1
              return (
                <li key={link.href} className={classes.Item} data-has-separator={hasSeparator ? '' : undefined}>
                  <Link className={classes.Link} data-has-emphasis={hasEmphasis ? '' : undefined} href={link.href}>
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
      {props.children}
    </header>
  )
}
