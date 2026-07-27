import './globals.css'
import {PageHeader} from './components/PageHeader'

export const metadata = {
  title: {
    default: 'primer / agent-eval',
    template: '%s · primer / agent-eval',
  },
  description: 'View results of experiments with agents across different scenarios with Primer',
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
