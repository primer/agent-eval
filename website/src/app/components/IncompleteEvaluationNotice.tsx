'use client'

import {Flash} from '@primer/react'
import type {Route} from 'next'
import type {TrialError} from '../../evaluation-state'
import {Link} from '../../components/Link'

export function IncompleteEvaluationNotice({errors, href}: {errors: Array<TrialError>; href?: Route}) {
  return (
    <Flash variant="warning">
      <h3 className="text-title-small">Incomplete evaluation</h3>
      <p>
        {errors.length} trial execution {errors.length === 1 ? 'error makes' : 'errors make'} this entire evaluation
        incomplete. Aggregate scores, comparisons, rankings, and usage deltas are unavailable for every group.
        Successful trial evidence is retained for diagnosis.
      </p>
      <ul>
        {errors.map(trial => {
          return (
            <li key={trial.id}>
              {trial.scenarioId} ({trial.id}): {trial.error.name}: {trial.error.message}
            </li>
          )
        })}
      </ul>
      {href ? <Link href={href}>View trial errors and raw run details</Link> : null}
    </Flash>
  )
}
