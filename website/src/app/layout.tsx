import './global.css'
import {BaseStyles} from './components/BaseStyles'

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" data-light-theme="light" data-dark-theme="dark" data-color-mode="auto" suppressHydrationWarning>
      <body>
        <BaseStyles>{children}</BaseStyles>
      </body>
    </html>
  )
}
