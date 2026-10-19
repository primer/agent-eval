import {listBenchmarks, listExperiments, listScenarios} from '../agent-eval'
import {Link} from '../components/Link'
import {benchmarksDirectory, experimentsDirectory, scenariosDirectory} from '../env'

export default async function IndexPage() {
  const benchmarks = await listBenchmarks({
    benchmarksDirectory,
    scenariosDirectory,
  })
  const experiments = await listExperiments({
    benchmarksDirectory,
    experimentsDirectory,
    scenariosDirectory,
  })
  const scenarios = await listScenarios({
    directory: scenariosDirectory,
  })

  return (
    <main>
      <h1>agent-eval</h1>
      <section>
        <article>
          <h2>Benchmarks</h2>
          <ul>
            {benchmarks.map(benchmark => {
              return (
                <li key={benchmark.id}>
                  <Link href={`/benchmarks/${benchmark.id}`}>{benchmark.name}</Link>
                </li>
              )
            })}
          </ul>
        </article>
        <article>
          <h2>Experiments</h2>
          <ul>
            {experiments.map(experiment => {
              return (
                <li key={experiment.id}>
                  <Link href={`/experiments/${experiment.id}`}>{experiment.name}</Link>
                </li>
              )
            })}
          </ul>
        </article>
        <article>
          <h2>Scenarios</h2>
          <ul>
            {scenarios.map(scenario => {
              return (
                <li key={scenario.id}>
                  <Link href={`/scenarios/${scenario.id}`}>{scenario.id}</Link>
                </li>
              )
            })}
          </ul>
        </article>
      </section>
    </main>
  )
}
