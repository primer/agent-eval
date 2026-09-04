export function App() {
  const issues = Array.from({length: 25}, (_, index) => {
    return {
      id: index + 1,
      title: `Issue ${index + 1}`,
    }
  })

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
