'use client'

import {Breadcrumbs} from '@primer/react'
import type {Experiment} from '../../../../experiments'
import Link from 'next/link'

type Props = {
  experiment: Experiment
}

export function Page({experiment}: Props) {
  return (
    <>
      <Breadcrumbs>
        <Breadcrumbs.Item as={Link} href="/experiments">
          Experiments
        </Breadcrumbs.Item>
        <Breadcrumbs.Item href={`/experiments/${experiment.id}`} aria-current="page">
          {experiment.id}
        </Breadcrumbs.Item>
      </Breadcrumbs>
      <h1>{experiment.name}</h1>
      <p>{experiment.description}</p>
    </>
  )
}
