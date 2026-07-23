import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: {
    default: 'Agent Eval',
    template: '%s · Agent Eval',
  },
  description: 'Manage agent evaluation experiments, scenarios, baselines, and runs.',
}

export default function Layout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-950 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <Link href="/" className="font-semibold tracking-tight text-slate-950">
              Agent Eval
            </Link>
            <nav aria-label="Primary navigation">
              <ul className="flex items-center gap-1 text-sm font-medium text-slate-600">
                <li>
                  <Link className="block rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-950" href="/">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    className="block rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-950"
                    href="/experiments"
                  >
                    Experiments
                  </Link>
                </li>
                <li>
                  <Link
                    className="block rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-950"
                    href="/scenarios"
                  >
                    Scenarios
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </body>
    </html>
  )
}
