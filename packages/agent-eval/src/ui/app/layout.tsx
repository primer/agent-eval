import type {Metadata} from 'next'
import type {ReactNode} from 'react'
import './global.css'

export const metadata: Metadata = {
  title: 'agent-eval',
}

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html
      lang="en"
      data-light-theme="light"
      data-dark-theme="dark"
      data-color-mode="auto"
      suppressHydrationWarning={true}
    >
      <body>{children}</body>
    </html>
  )
}
