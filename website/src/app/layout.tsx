import './globals.css'
import {PageHeader} from './components/PageHeader'

export const metadata = {
  title: {
    default: 'Primer Agent Eval',
    template: '%s · Primer Agent Eval',
  },
  description: 'Manage agent evaluation experiments, scenarios, baselines, and runs.',
}

export default function Layout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
      <body>
        <PageHeader />
        <main>{children}</main>
      </body>
    </html>
  )
}
