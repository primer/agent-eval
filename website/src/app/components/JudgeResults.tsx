import type {JudgeDetails} from '../../run-details'

export function JudgeResults({judges}: {judges: Array<JudgeDetails>}) {
  if (judges.length === 0) {
    return <p className="m-0 text-muted">No judge results were recorded.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {judges.map(({config, result}, index) => {
        const selectedScore =
          result.type === 'result'
            ? config.scores.find(score => {
                return score.value === result.score
              })
            : undefined

        return (
          <section className="border-t border-default pt-6 first:border-t-0 first:pt-0 min-w-0" key={index}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-title-small m-0 break-words">{config.name}</h3>
              {result.type === 'result' ? (
                <span className="bg-neutral-muted rounded-full px-3 py-1 text-body-medium whitespace-nowrap">
                  Score: {result.score}
                </span>
              ) : null}
            </div>
            {config.description ? <p className="text-muted mt-2 mb-0">{config.description}</p> : null}
            {result.type === 'error' ? (
              <div className="bg-danger-muted border border-danger-muted rounded-md p-3 mt-4">
                <h4 className="text-body-medium text-danger mt-0 mb-2">Judge error</h4>
                <p className="m-0 whitespace-pre-wrap break-words">{result.message}</p>
              </div>
            ) : null}
            {result.type === 'unknown' ? (
              <p className="text-muted mt-4 mb-0">No result was recorded for this judge.</p>
            ) : null}
            {result.type === 'result' ? (
              <div className="flex flex-col gap-4 mt-4">
                {selectedScore ? <p className="m-0 whitespace-pre-wrap break-words">{selectedScore.description}</p> : null}
                <div>
                  <h4 className="text-body-medium mt-0 mb-2">Rationale</h4>
                  <p className="m-0 whitespace-pre-wrap break-words">{result.rationale}</p>
                </div>
                <div>
                  <h4 className="text-body-medium mt-0 mb-2">Findings</h4>
                  {result.findings.length === 0 ? (
                    <p className="m-0 text-muted">No file-backed findings were recorded.</p>
                  ) : (
                    <ul className="list-none p-0 m-0 flex flex-col gap-3">
                      {result.findings.map((finding, findingIndex) => {
                        return (
                          <li className="border border-default rounded-md overflow-hidden" key={findingIndex}>
                            <div className="bg-muted border-b border-default px-3 py-2">
                              <code className="text-body-small break-all">{finding.filepath}</code>
                            </div>
                            <pre className="m-0 p-3 overflow-x-auto text-body-small">
                              <code>{finding.snippet}</code>
                            </pre>
                            <p className="m-0 px-3 pb-3 whitespace-pre-wrap break-words">{finding.explanation}</p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
            <details className="mt-4">
              <summary className="cursor-pointer text-body-medium">Scoring criteria</summary>
              {config.judge.instructions ? (
                <p className="whitespace-pre-wrap break-words">{config.judge.instructions}</p>
              ) : null}
              <dl className="flex flex-col gap-3 mb-0">
                {config.scores.map((score, scoreIndex) => {
                  return (
                    <div key={scoreIndex}>
                      <dt className="font-semibold">Score: {score.value}</dt>
                      <dd className="m-0 whitespace-pre-wrap break-words">{score.description}</dd>
                    </div>
                  )
                })}
              </dl>
            </details>
          </section>
        )
      })}
    </div>
  )
}
