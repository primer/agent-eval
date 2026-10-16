import type {Metadata} from 'next'
import type {ReactNode} from 'react'

export const metadata: Metadata = {
  title: 'agent-eval',
}

export const ensureStatic = 'navigation'

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
