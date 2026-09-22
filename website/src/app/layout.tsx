import {BaseStyles} from '@primer/react'
import {PageHeader} from './components/PageHeader'

export default function Layout({children}: {children: React.ReactNode}) {
  return (
        <BaseStyles>
          <PageHeader />
          <main>{children}</main>
        </BaseStyles>
  )
}
