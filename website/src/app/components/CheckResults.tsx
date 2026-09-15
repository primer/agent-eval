import type {CheckOutput} from '@primer/agent-eval'
import {CheckCircleFillIcon, SkipFillIcon, XCircleFillIcon} from '@primer/octicons-react'

export function CheckResults({checks}: {checks: Array<CheckOutput>}) {
  if (checks.length === 0) {
    return <p className="m-0 text-muted">No check results were recorded.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {checks.map(({check, result}, index) => {
        const values = result.type === 'outcomes' ? result.outcomes : result.measurements
        return (
          <section className="border-t border-default pt-4 first:border-t-0 first:pt-0" key={index}>
            <h3 className="text-title-small m-0">
              {check.name}
              {result.id !== undefined ? ` / ${result.id}` : ''}
            </h3>
            {check.description ? <p className="text-muted mt-2 mb-0">{check.description}</p> : null}
            {result.type === 'measurements' ? (
              <p className="text-muted mt-2 mb-0">
                Unit: {result.unit ?? 'not specified'}. Direction: {result.direction ?? 'not specified'}.
              </p>
            ) : null}
            {values.length === 0 ? (
              <p>No values were recorded for this check.</p>
            ) : (
              <ul className="list-none p-0 mb-0">
                {values.map((value, valueIndex) => {
                  if (value.type === 'error') {
                    return (
                      <li className="bg-danger-muted text-danger rounded-md p-3 my-2" key={valueIndex}>
                        <strong>Check error: </strong>
                        {value.message}
                      </li>
                    )
                  }
                  if (value.type === 'measurement') {
                    return (
                      <li className="border-t border-default py-2 first:border-t-0" key={valueIndex}>
                        Measurement {valueIndex + 1}: {value.value}
                        {result.type === 'measurements' && result.unit ? ` ${result.unit}` : ''}
                      </li>
                    )
                  }
                  const color =
                    value.status === 'passed'
                      ? 'text-success'
                      : value.status === 'failed'
                        ? 'text-danger'
                        : 'text-muted'
                  const Icon =
                    value.status === 'passed'
                      ? CheckCircleFillIcon
                      : value.status === 'failed'
                        ? XCircleFillIcon
                        : SkipFillIcon
                  return (
                    <li
                      className="border-t border-default py-2 first:border-t-0 flex justify-between gap-3"
                      key={valueIndex}
                    >
                      <span className="flex items-start gap-2 min-w-0">
                        <span className={`${color} shrink-0`}>
                          <Icon aria-hidden="true" />
                        </span>
                        <span className="break-words min-w-0">{value.id ?? `Outcome ${valueIndex + 1}`}</span>
                      </span>
                      <span className={color}>{value.status}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
