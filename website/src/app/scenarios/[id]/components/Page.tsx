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
            <pre className="text-code-block text-default bg-muted border-default rounded-md m-0 overflow-x-auto border p-4">
              <code>{scenario.test}</code>
            </pre>
          </section>
          {scenario.rubric ? (
            <section aria-labelledby="rubric-heading">
              <h2 className="text-title-medium mb-3" id="rubric-heading">
                Rubric
              </h2>
              <p className="text-body-medium text-muted">
                Judged by {scenario.rubric.judge.name} ({scenario.rubric.judge.reasoningEffort})
              </p>
              <div className="grid gap-3">
                {scenario.rubric.criteria.map(criterion => {
                  return (
                    <article className="border-default rounded-md border p-4" key={criterion.name}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-title-small m-0">{criterion.name}</h3>
                        <span className="text-caption text-muted">
                          Weight {criterion.weight}
                          {criterion.minimumScore !== undefined ? `, minimum ${criterion.minimumScore}/5` : ''}
                        </span>
                      </div>
                      {criterion.description ? (
                        <p className="text-body-medium text-muted mb-0 mt-2">{criterion.description}</p>
                      ) : null}
                      <ol className="mb-0 mt-3 grid gap-1 pl-6">
                        {Object.entries(criterion.scores).map(([score, description]) => {
                          return (
                            <li key={score}>
                              <strong>{score}:</strong> {description}
                            </li>
                          )
                        })}
                      </ol>
                      {criterion.goodExamples?.length ? (
                        <>
                          <h4 className="text-body-medium mb-1 mt-3">Good examples</h4>
                          <ul className="mb-0 mt-0 pl-6">
                            {criterion.goodExamples.map(example => {
                              return <li key={example}>{example}</li>
                            })}
                          </ul>
                        </>
                      ) : null}
                      {criterion.badExamples?.length ? (
                        <>
                          <h4 className="text-body-medium mb-1 mt-3">Bad examples</h4>
                          <ul className="mb-0 mt-0 pl-6">
                            {criterion.badExamples.map(example => {
                              return <li key={example}>{example}</li>
                            })}
                          </ul>
                        </>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}
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
