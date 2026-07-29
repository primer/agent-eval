'use client'

import {Breadcrumbs, PageHeader, PageLayout, Stack} from '@primer/react'
import type {Experiment} from '../../../../experiments'
import {Link} from '../../../../components/Link'
import type {Scenario} from '../../../../scenarios'
import NextLink from 'next/link'

type Props = {
  scenario: Scenario
  experiments: Array<Experiment>
}

export function Page({scenario, experiments}: Props) {
  return (
    <PageLayout containerWidth="large" padding="normal" rowGap="normal">
      <PageLayout.Header>
        <PageHeader>
          <PageHeader.ContextArea>
            <PageHeader.Breadcrumbs>
              <Breadcrumbs>
                <Breadcrumbs.Item as={NextLink} href="/scenarios">
                  Scenarios
                </Breadcrumbs.Item>
                <Breadcrumbs.Item selected>{scenario.id}</Breadcrumbs.Item>
              </Breadcrumbs>
            </PageHeader.Breadcrumbs>
          </PageHeader.ContextArea>
          <PageHeader.TitleArea variant="large">
            <PageHeader.Title as="h1">{scenario.id}</PageHeader.Title>
          </PageHeader.TitleArea>
        </PageHeader>
      </PageLayout.Header>
      <PageLayout.Content as="div">
        <Stack gap="spacious">
          <section aria-labelledby="prompt-heading">
            <h2 className="text-title-medium mb-3" id="prompt-heading">
              Prompt
            </h2>
            <p className="text-body-large text-default m-0 max-w-[80ch]">{scenario.prompt}</p>
          </section>
          <section aria-labelledby="tests-heading">
            <h2 className="text-title-medium mb-3" id="tests-heading">
              Tests
            </h2>
            {scenario.tests.length > 0 && (
              <ul className="m-0 mb-4 list-none p-0">
                {scenario.tests.map((name, index) => (
                  <li className="text-body-medium text-default py-1" key={index}>
                    {name}
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary className="text-body-medium text-muted cursor-pointer select-none">View test source</summary>
              <pre className="text-code-block text-default bg-muted border-default rounded-md m-0 mt-2 overflow-x-auto border p-4">
                <code>{scenario.test}</code>
              </pre>
            </details>
          </section>
          <section aria-labelledby="experiments-heading">
            <h2 className="text-title-medium mb-3" id="experiments-heading">
              Experiments
            </h2>
            {experiments.length > 0 ? (
              <ul className="m-0 grid list-none gap-3 p-0">
                {experiments.map(experiment => (
                  <li className="border-default rounded-md border p-4" key={experiment.id}>
                    <Link className="text-body-large font-semibold" href={`/experiments/${experiment.id}`}>
                      {experiment.name}
                    </Link>
                    <p className="text-body-medium text-muted mb-0 mt-2">{experiment.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-medium text-muted m-0">This scenario is not included in any experiments.</p>
            )}
          </section>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  )
}
