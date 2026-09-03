export function App() {
  const isLoading = false
  const repositories = [{id: 1, name: 'octo-repo'}]

  return (
    <main>
      <h1>Repositories</h1>
      <p>{isLoading ? 'Loading repositories' : `${repositories.length} repositories`}</p>
      <ul>
        {repositories.map(repository => {
          return <li key={repository.id}>{repository.name}</li>
        })}
      </ul>
    </main>
  )
}
