import type {Metadata} from 'next'
import type {PropsWithChildren} from 'react'
import './globals.css'
import {Providers} from './providers'

export const metadata: Metadata = {
  title: {
    default: 'Agent evals',
    template: '%s · Agent evals',
  },
  description: 'Explore agent evaluation results and compare model performance.',
}

export default function RootLayout({children}: PropsWithChildren) {
  return (
    <html lang="en" data-light-theme="light" data-dark-theme="dark" data-color-mode="auto" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
