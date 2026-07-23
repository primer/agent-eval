export function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    style: 'percent',
  }).format(value / 100)
}

export function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}
