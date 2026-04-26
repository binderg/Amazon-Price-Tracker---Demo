/** Returns a friendly "X minutes ago" string */
export function formatDistanceToNow(isoString) {
  if (!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Short date label for chart axes, e.g. "Apr 15" */
export function shortDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Full date-time string for tooltips */
export function fullDateTime(isoString) {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Smart axis tick: if all points are same day show "2:30 PM",
 * otherwise show "Apr 26".
 * Pass isSameDay=true when the whole dataset spans ≤1 day.
 */
export function smartAxisTick(isoString, isSameDay) {
  const d = new Date(isoString)
  if (isSameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
