import Link from 'next/link'
import type {ReactNode} from 'react'
import type {RunStatus} from '../lib/domain'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header>
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  )
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section>
      <div>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Card({children}: {children: ReactNode}) {
  return <div>{children}</div>
}

export function Stat({label, value, detail}: {label: string; value: string; detail?: string}) {
  return (
    <Card>
      <p>{label}</p>
      <p>{value}</p>
      {detail ? <p>{detail}</p> : null}
    </Card>
  )
}

export function Badge({children}: {children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'info'}) {
  return <span>{children}</span>
}

export function StatusBadge({status}: {status: RunStatus}) {
  const tone = status === 'completed' ? 'good' : status === 'failed' ? 'bad' : status === 'running' ? 'info' : 'neutral'
  return <Badge tone={tone}>{status}</Badge>
}

export function ButtonLink({href, children}: {href: string; children: ReactNode; variant?: 'default' | 'primary'}) {
  return <Link href={href}>{children}</Link>
}

export function SubmitButton({children}: {children: ReactNode; variant?: 'default' | 'primary'}) {
  return <button type="submit">{children}</button>
}

export function Field({
  label,
  name,
  description,
  children,
}: {
  label: string
  name: string
  description?: string
  children: ReactNode
}) {
  const descriptionId = description ? `${name}-description` : undefined
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      {description ? <p id={descriptionId}>{description}</p> : null}
      <div data-description-id={descriptionId}>{children}</div>
    </div>
  )
}

export function Notice({children}: {children: ReactNode}) {
  return <div role="status">{children}</div>
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value))
}

export function formatDuration(value: number): string {
  return `${(value / 1000).toFixed(1)}s`
}

export function passRate(passed: number, failed: number): string {
  const total = passed + failed
  return total === 0 ? '—' : `${Math.round((passed / total) * 100)}%`
}
