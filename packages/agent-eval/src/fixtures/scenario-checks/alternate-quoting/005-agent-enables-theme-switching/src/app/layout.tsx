// prettier-ignore
import type {ReactNode} from "react"
// prettier-ignore
import "@primer/primitives/dist/css/primitives.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/light.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/light-tritanopia.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/light-tritanopia-high-contrast.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/light-high-contrast.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/light-colorblind.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/light-colorblind-high-contrast.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark-colorblind.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark-colorblind-high-contrast.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark-dimmed.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark-dimmed-high-contrast.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark-high-contrast.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark-tritanopia.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark-tritanopia-high-contrast.css"

export default function Layout({children}: {children: ReactNode}) {
  return (
    <html data-color-mode="auto" data-light-mode="light" data-dark-mode="dark">
      <body>{children}</body>
    </html>
  )
}
