import {Index} from './components/Index'
import {list} from '../experiments'

export default async function IndexPage() {
  const experiments = await list()
  return <Index experiments={experiments} />
}

// import Link from 'next/link'
// import {
//   Badge,
//   ButtonLink,
//   Card,
//   formatDate,
//   formatDuration,
//   PageHeader,
//   passRate,
//   Section,
//   Stat,
//   StatusBadge,
// } from '../components/ui'
// import {getDashboardSnapshot} from '../lib/repository'

// export default function IndexPage() {
//   const snapshot = getDashboardSnapshot()
//   const {baseline} = snapshot
//
//   return (
//     <>
//       <PageHeader
//         eyebrow="Workspace overview"
//         title="Agent evaluation dashboard"
//         description="Track baseline health, define reusable scenarios, and compare agent treatments across models."
//         actions={
//           <ButtonLink href="/experiments" variant="primary">
//             Create experiment
//           </ButtonLink>
//         }
//       />
//
//       <Section title="Baseline" description="Latest recorded result for each scenario.">
//         <div>
//           <Stat
//             label="Scenario coverage"
//             value={`${baseline.passing}/${baseline.scenarios}`}
//             detail="passing baselines"
//           />
//           <Stat
//             label="Test pass rate"
//             value={passRate(baseline.tests.passed, baseline.tests.failed)}
//             detail={`${baseline.tests.passed} passed · ${baseline.tests.failed} failed`}
//           />
//           <Stat label="Average duration" value={formatDuration(baseline.averageDurationMs)} detail="per scenario" />
//           <Stat
//             label="Experiments"
//             value={String(snapshot.experiments.length)}
//             detail={`${snapshot.recentRuns.length} recent runs`}
//           />
//         </div>
//       </Section>
//
//       <Section
//         title="Experiments"
//         description="Configurations that combine models, scenarios, and treatments."
//         action={<ButtonLink href="/experiments">View all</ButtonLink>}
//       >
//         <div>
//           {snapshot.experiments.slice(0, 4).map(experiment => (
//             <Card key={experiment.id}>
//               <div>
//                 <div>
//                   <Link href={`/experiments/${experiment.id}`}>{experiment.name}</Link>
//                   <p>{experiment.description}</p>
//                 </div>
//                 <Badge>{experiment.models.length} models</Badge>
//               </div>
//               <dl>
//                 <div>
//                   <dt>Scenarios</dt>
//                   <dd>{experiment.scenarioIds.length}</dd>
//                 </div>
//                 <div>
//                   <dt>Treatments</dt>
//                   <dd>{experiment.treatments.length}</dd>
//                 </div>
//               </dl>
//             </Card>
//           ))}
//         </div>
//       </Section>
//
//       <Section
//         title="Scenarios"
//         description="Reusable prompts and assertions with a tracked baseline."
//         action={<ButtonLink href="/scenarios">View all</ButtonLink>}
//       >
//         <div>
//           <table>
//             <thead>
//               <tr>
//                 <th scope="col">Scenario</th>
//                 <th scope="col">Model</th>
//                 <th scope="col">Baseline</th>
//               </tr>
//             </thead>
//             <tbody>
//               {snapshot.scenarios.map(scenario => (
//                 <tr key={scenario.id}>
//                   <td>
//                     <Link href={`/scenarios/${scenario.id}`}>{scenario.name}</Link>
//                     <p>{scenario.id}</p>
//                   </td>
//                   <td>{scenario.baseline?.model ?? 'Not recorded'}</td>
//                   <td>
//                     <Badge
//                       tone={scenario.baseline?.status === 'passing' ? 'good' : scenario.baseline ? 'bad' : 'neutral'}
//                     >
//                       {scenario.baseline?.status ?? 'missing'}
//                     </Badge>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </Section>
//
//       <Section title="Recent runs">
//         <div>
//           {snapshot.recentRuns.map(run => {
//             const experiment = snapshot.experiments.find(item => item.id === run.experimentId)
//             return (
//               <Card key={run.id}>
//                 <div>
//                   <Link href={`/experiments/${run.experimentId}`}>{experiment?.name ?? run.experimentId}</Link>
//                   <p>Queued {formatDate(run.queuedAt)}</p>
//                 </div>
//                 <StatusBadge status={run.status} />
//               </Card>
//             )
//           })}
//         </div>
//       </Section>
//     </>
//   )
// }
