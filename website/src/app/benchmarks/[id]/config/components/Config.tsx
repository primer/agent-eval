'use client'

import type {Benchmark} from '@primer/agent-eval'
import {PageLayout, PageHeader} from '@primer/react'

type ConfigProps = {
  benchmark: Pick<Benchmark, 'id' | 'name'>
}

export function Config({benchmark}: ConfigProps) {
  return (
    <PageLayout>
      <PageLayout.Header>
        <PageHeader>
          <PageHeader.TitleArea>
            <PageHeader.Title as="h1">Config</PageHeader.Title>
          </PageHeader.TitleArea>
          <PageHeader.Description className="text-muted">
            Showing config for benchmark: {benchmark.name}
          </PageHeader.Description>
        </PageHeader>
      </PageLayout.Header>
      <PageLayout.Content>content</PageLayout.Content>
    </PageLayout>
  )
}
