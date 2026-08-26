export function App() {
  const issues = [
    {id: 1, title: 'Improve keyboard navigation'},
    {id: 2, title: 'Document release process'},
  ]

  return (
    <main>
      <h1>Issues</h1>
      <ul>
        {issues.map(issue => {
          return <li key={issue.id}>{issue.title}</li>
        })}
      </ul>
    </main>
  )
}
