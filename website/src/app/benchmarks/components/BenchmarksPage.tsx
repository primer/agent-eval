'use client'

import {HomeIcon} from '@primer/octicons-react'
import {Button, NavList, PageHeader, PageLayout} from '@primer/react'

export function BenchmarksClientPage({children}: {children: React.ReactNode}) {
  return (
    <PageLayout padding="none">
      <PageLayout.Header padding="condensed">
        <PageHeader>
          <PageHeader.TitleArea>
            <PageHeader.Title as="h1">Benchmark runs</PageHeader.Title>
          </PageHeader.TitleArea>
          <PageHeader.Description className="text-muted">Showing all available benchmark runs</PageHeader.Description>
          <PageHeader.Actions>
            <Button variant="primary" size="small">
              New benchmark
            </Button>
          </PageHeader.Actions>
        </PageHeader>
      </PageLayout.Header>
      <PageLayout.Sidebar divider="line" sticky padding="condensed">
        <NavList aria-label="Benchmarks navigation">
          <NavList.Item>
            <div className="flex items-center gap-x-2">
              <HomeIcon className="text-muted" />
              All benchmarks
            </div>
          </NavList.Item>
          <NavList.Group>
            <NavList.GroupHeading>Benchmarks</NavList.GroupHeading>
            <NavList.Item>Benchmark 1</NavList.Item>
          </NavList.Group>
        </NavList>
      </PageLayout.Sidebar>
      <PageLayout.Content>{children}</PageLayout.Content>
    </PageLayout>
  )
}
