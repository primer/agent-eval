export function getScenarioAnchor(scenarioId: string): {id: string; fragment: string} {
  // Percent-free IDs avoid differences between native and Next.js fragment lookups.
  const id = `scenario-${encodeURIComponent(scenarioId).replaceAll('_', '%5F').replaceAll('%', '_')}`
  return {
    id,
    fragment: `#${id}`,
  }
}
