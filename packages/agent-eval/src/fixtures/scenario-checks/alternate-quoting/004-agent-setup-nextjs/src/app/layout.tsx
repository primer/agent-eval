// prettier-ignore
import type {ReactNode} from "react"
// prettier-ignore
import {BaseStyles} from "@primer/react"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/light.css"
// prettier-ignore
import "@primer/primitives/dist/css/functional/themes/dark.css"

export default function Layout({children}: {children: ReactNode}) {
  return (
    <html data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
      <body>
        <BaseStyles>{children}</BaseStyles>
      </body>
    </html>
  )
}
