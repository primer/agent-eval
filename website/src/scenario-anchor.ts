export function getScenarioAnchor(scenarioId: string, capabilityId?: string): {id: string; fragment: string} {
  // Percent-free IDs avoid differences between native and Next.js fragment lookups.
  const key = capabilityId === undefined ? scenarioId : JSON.stringify([capabilityId, scenarioId])
  const prefix = capabilityId === undefined ? 'scenario' : 'capability-scenario'
  const id = `${prefix}-${encodeURIComponent(key).replaceAll('_', '%5F').replaceAll('%', '_')}`
  return {
    id,
    fragment: `#${id}`,
  }
}
