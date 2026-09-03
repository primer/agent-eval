import type {BenchmarkOutput} from '@primer/agent-eval/benchmark'
import type {Route} from 'next'
import {notFound} from 'next/navigation'
import {get as getBenchmark, list as listBenchmarks} from '../../../../../benchmarks'
import {getBenchmarkRun, listBenchmarkRuns, type BenchmarkRun} from '../../../../../benchmark-results'
import {createTranscript, getWalkthroughDataUrls, type RunDetails} from '../../../../../run-details'
import {RunDetailsPage} from '../../../../components/RunDetailsPage'

const EMPTY_RUN_PARAM = '__no-runs__'

type BenchmarkOutputTrial = BenchmarkOutput['trials'] extends Map<string, infer Trial> ? Trial : never

type RunPageProps = {
  params: Promise<{
    id: string
    date: string
  }>
}

async function createBenchmarkRunDetails(run: BenchmarkRun): Promise<RunDetails> {
  const treatments = new Map(
    [...run.output.treatments].map(([id, treatment]) => {
      return [id, treatment.name]
    }),
  )

  return {
    date: run.name,
    results: await Promise.all(
      [...run.output.trials.values()].map(async (trial: BenchmarkOutputTrial) => {
        const sessions = trial.agent.sessions
        return {
          id: trial.id,
          scenarioId: trial.scenarioId,
          context: trial.capabilityId,
          treatment: treatments.get(trial.treatmentId) ?? 'Unknown treatment',
          model: trial.model.name,
          reasoningEffort: trial.model.reasoningEffort,
          testsPassed: trial.testResults.numPassedTests,
          totalTests: trial.testResults.numTotalTests,
          turns: sessions.reduce((total, session) => {
            return total + session.turns
          }, 0),
          outputTokens: sessions.reduce((total, session) => {
            return total + session.outputTokens
          }, 0),
          premiumRequests: sessions.reduce((total, session) => {
            return total + session.premiumRequests
          }, 0),
          totalApiDurationMs: sessions.reduce((total, session) => {
            return total + session.totalApiDurationMs
          }, 0),
          sessionDurationMs: sessions.reduce((total, session) => {
            return total + session.sessionDurationMs
          }, 0),
          tests: trial.testResults.testResults.flatMap(testResult => {
            return testResult.assertionResults.map(assertion => {
              return {
                fullName: assertion.fullName,
                status: assertion.status,
                description: assertion.meta.description,
              }
            })
          }),
          walkthrough: await getWalkthroughDataUrls(trial.walkthrough, run.directory),
          transcript: createTranscript(
            sessions.flatMap(session => {
              return session.messages
            }),
          ),
        }
      }),
    ),
  }
}

export const dynamicParams = false

export default async function BenchmarkRunPage(props: RunPageProps) {
  const {id, date} = await props.params
  if (id === EMPTY_RUN_PARAM && date === EMPTY_RUN_PARAM) {
    notFound()
  }

  const [benchmark, run] = await Promise.all([getBenchmark(id), getBenchmarkRun(id, date)])
  if (!run) {
    notFound()
  }

  return (
    <RunDetailsPage
      resource={{
        id: benchmark.id,
        name: benchmark.name,
        collectionLabel: 'Benchmarks',
        collectionHref: '/benchmarks',
        href: `/benchmarks/${benchmark.id}` as Route,
      }}
      run={await createBenchmarkRunDetails(run)}
    />
  )
}

export async function generateStaticParams() {
  const benchmarks = await listBenchmarks()
  const params = (
    await Promise.all(
      benchmarks.map(async benchmark => {
        const runs = await listBenchmarkRuns(benchmark.id)
        return runs.map(run => {
          return {
            id: benchmark.id,
            date: run.name,
          }
        })
      }),
    )
  ).flat()

  return params.length > 0 ? params : [{id: EMPTY_RUN_PARAM, date: EMPTY_RUN_PARAM}]
}
