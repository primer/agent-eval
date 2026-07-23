import {Dashboard} from '../components/dashboard'
import {getDashboardData} from '../evals'

export default async function HomePage() {
  const data = await getDashboardData()
  return <Dashboard data={data} />
}
