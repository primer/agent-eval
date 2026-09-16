import './globals.css'
import {BaseStyles} from '@primer/react'
import {PageHeader} from './components/PageHeader'

export const metadata = {
  title: {
    default: 'primer / agent-eval',
    template: '%s · primer / agent-eval',
  },
  description: 'View design system benchmark and experiment results for coding agents',
}

export default function Layout({children}: {children: React.ReactNode}) {
  return (
    // BaseStyles loads focus-visible, which adds these root attributes before hydration.
    <html
      lang="en"
      className="js-focus-visible"
      data-js-focus-visible=""
      data-color-mode="auto"
      data-light-theme="light"
      data-dark-theme="dark"
    >
      <body>
        <BaseStyles>
          <PageHeader />
          <main>{children}</main>
        </BaseStyles>
      </body>
    </html>
  )
}
