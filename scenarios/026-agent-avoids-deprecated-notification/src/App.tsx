export function App() {
  const isBranchProtectionEnabled = false

  return (
    <main>
      <h1>Repository settings</h1>
      <p>Branch protection is {isBranchProtectionEnabled ? 'enabled' : 'disabled'} for the default branch.</p>
      <a href="/settings/branches">Branch protection settings</a>
    </main>
  )
}
