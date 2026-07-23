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
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="mb-2 text-sm font-semibold text-blue-700">{eyebrow}</p> : null}
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 text-base leading-7 text-slate-600">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
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
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Card({children, className = ''}: {children: ReactNode; className?: string}) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>
}

export function Stat({label, value, detail}: {label: string; value: string; detail?: string}) {
  return (
    <Card>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </Card>
  )
}

export function Badge({children, tone = 'neutral'}: {children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'info'}) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    good: 'bg-green-100 text-green-800',
    bad: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function StatusBadge({status}: {status: RunStatus}) {
  const tone = status === 'completed' ? 'good' : status === 'failed' ? 'bad' : status === 'running' ? 'info' : 'neutral'
  return <Badge tone={tone}>{status}</Badge>
}

export function ButtonLink({
  href,
  children,
  variant = 'default',
}: {
  href: string
  children: ReactNode
  variant?: 'default' | 'primary'
}) {
  const styles =
    variant === 'primary'
      ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800'
      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
  return (
    <Link
      href={href}
      className={`inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${styles}`}
    >
      {children}
    </Link>
  )
}

export function SubmitButton({children, variant = 'primary'}: {children: ReactNode; variant?: 'default' | 'primary'}) {
  const styles =
    variant === 'primary'
      ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800'
      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
  return (
    <button
      type="submit"
      className={`inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${styles}`}
    >
      {children}
    </button>
  )
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
      <label htmlFor={name} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      ) : null}
      <div className="mt-2" data-description-id={descriptionId}>
        {children}
      </div>
    </div>
  )
}

export const inputClassName =
  'block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'

export function Notice({children}: {children: ReactNode}) {
  return (
    <div role="status" className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      {children}
    </div>
  )
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
