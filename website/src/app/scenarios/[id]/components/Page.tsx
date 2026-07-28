'use client'

import {Breadcrumbs} from '@primer/react'
import type {Scenario} from '../../../../scenarios'
import Link from 'next/link'

type Props = {
  scenario: Scenario
}

export function Page({scenario}: Props) {
  return (
    <>
      <Breadcrumbs>
        <Breadcrumbs.Item as={Link} href="/scenarios">
          Scenarios
        </Breadcrumbs.Item>
        <Breadcrumbs.Item selected>{scenario.id}</Breadcrumbs.Item>
      </Breadcrumbs>
      <h1>{scenario.id}</h1>
      <p>{scenario.prompt}</p>
    </>
  )
}
