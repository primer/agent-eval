'use client'

import {PageHeader, PageLayout} from '@primer/react'

export function BenchmarksPageLayout({children}: {children: React.ReactNode}) {
  return (
    <PageLayout>
      <PageLayout.Header>
        <PageHeader>
          <PageHeader.TitleArea>
            <PageHeader.Title as="h1">
              {/* TODO: move `id` to PageHeader.Title when it supports it */}
              <span id="benchmarks-page-heading">Benchmarks</span>
            </PageHeader.Title>
          </PageHeader.TitleArea>
          <PageHeader.Description className="text-muted">Showing all available benchmarks</PageHeader.Description>
        </PageHeader>
      </PageLayout.Header>
      <PageLayout.Content>{children}</PageLayout.Content>
    </PageLayout>
  )
}
