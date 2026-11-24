/** Short, glanceable numbers for the map chrome. */

export const formatDistance = (metres: number) =>
  metres < 1000
    ? `${Math.max(10, Math.round(metres / 10) * 10)} m`
    : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`

export const formatHa = (ha: number) =>
  ha < 10 ? ha.toFixed(1) : String(Math.round(ha))

export function formatAgo(t: number, now = Date.now()) {
  const minutes = Math.round((now - t) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
