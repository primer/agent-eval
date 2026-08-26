export function App() {
  const hasPastDueBalance = true

  return (
    <main>
      <h1>Account</h1>
      <p>{hasPastDueBalance ? 'Payment required' : 'Your account is in good standing'}</p>
      <a href="/settings/billing">Billing settings</a>
    </main>
  )
}
