import type {ReactNode} from 'react'
import '@primer/primitives/dist/css/primitives.css'
import '@primer/primitives/dist/css/functional/themes/light.css'
import '@primer/primitives/dist/css/functional/themes/dark.css'
import '@primer/primitives/dist/css/functional/themes/light-tritanopia.css'
import '@primer/primitives/dist/css/functional/themes/light-tritanopia-high-contrast.css'
import '@primer/primitives/dist/css/functional/themes/light-high-contrast.css'
import '@primer/primitives/dist/css/functional/themes/light-colorblind.css'
import '@primer/primitives/dist/css/functional/themes/light-colorblind-high-contrast.css'
import '@primer/primitives/dist/css/functional/themes/dark-colorblind.css'
import '@primer/primitives/dist/css/functional/themes/dark-colorblind-high-contrast.css'
import '@primer/primitives/dist/css/functional/themes/dark-dimmed.css'
import '@primer/primitives/dist/css/functional/themes/dark-dimmed-high-contrast.css'
import '@primer/primitives/dist/css/functional/themes/dark-high-contrast.css'
import '@primer/primitives/dist/css/functional/themes/dark-tritanopia.css'
import '@primer/primitives/dist/css/functional/themes/dark-tritanopia-high-contrast.css'

export default function Layout({children}: {children: ReactNode}) {
  return (
    <html data-color-mode="auto" data-light-mode="light" data-dark-mode="dark">
      <body>{children}</body>
    </html>
  )
}
