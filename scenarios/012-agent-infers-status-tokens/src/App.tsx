export function App() {
  const deployments = [
    {id: 1, name: 'Production', status: 'success'},
    {id: 2, name: 'Staging', status: 'failure'},
  ]

  return (
    <main>
      <h1>Deployments</h1>
      <ul>
        {deployments.map(deployment => {
          return (
            <li className={`deployment deployment-${deployment.status}`} key={deployment.id}>
              <span>{deployment.name}</span>
              <span>{deployment.status}</span>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
