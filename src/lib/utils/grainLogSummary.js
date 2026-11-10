// src/lib/utils/grainLogSummary.js
// Human wording for one grain_log row — shared by the grain record list so
// the same event reads the same everywhere (bin modal, chaser modal, record
// tab). Kept as plain functions so the wording is unit-testable.

/**
 * The fields of a grain_log row this module reads (a subset of
 * GrainLogEntry, so partial/test rows work too).
 * @typedef {{
 *   action?: string | null,
 *   bin_name?: string | null,
 *   vehicle_name?: string | null,
 *   tonnes_before?: number | null,
 *   tonnes_after?: number | null,
 *   bin_fill_before?: number | null,
 *   bin_fill_after?: number | null,
 * }} GrainLogLike
 */

/**
 * A missing reading is `null` — Number(null) would read as 0.
 * @param {unknown} value
 */
function reading(value) {
  if (value === null || value === undefined || value === "") return NaN
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

/**
 * "78%" — fill is stored as a float, the record shows whole percent.
 * @param {number | null | undefined} percent
 */
export function formatFill(percent) {
  const n = reading(percent)
  if (Number.isNaN(n)) return "—"
  return `${Math.round(n)}%`
}

/**
 * "38.5 t" — one decimal (tonnes are recorded to 0.01 internally).
 * @param {number | null | undefined} tonnes
 */
export function formatLogTonnes(tonnes) {
  const n = reading(tonnes)
  if (Number.isNaN(n)) return "—"
  return `${(Math.round(n * 10) / 10).toFixed(1)} t`
}

/**
 * "+12 t" / "−12 t" / "" — the change between two tonne readings.
 * @param {number | null | undefined} before
 * @param {number | null | undefined} after
 */
function tonnesDelta(before, after) {
  const from = reading(before)
  const to = reading(after)
  if (Number.isNaN(from) || Number.isNaN(to)) return ""
  const diff = Math.round((to - from) * 10) / 10
  if (diff === 0) return ""
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff)} t`
}

/**
 * Tonnes moved out of the chaser by a chaser.empty row.
 * @param {GrainLogLike} entry
 */
export function transferMovedTonnes(entry) {
  const before = reading(entry?.tonnes_before)
  const after = reading(entry?.tonnes_after)
  if (Number.isNaN(before) || Number.isNaN(after)) return NaN
  return Math.max(0, Math.round((before - after) * 10) / 10)
}

/**
 * One-line description of a grain_log row.
 * @param {GrainLogLike} entry
 * @returns {{ title: string, detail: string }}
 */
export function grainLogSummary(entry) {
  const action = entry?.action
  const binName = entry?.bin_name || "Bin"
  const vehicleName = entry?.vehicle_name || "Chaser bin"

  if (action === "chaser.empty") {
    const moved = transferMovedTonnes(entry)
    const parts = [
      Number.isFinite(moved) ? `Moved ${formatLogTonnes(moved)}` : "Emptied",
      `bin now ${formatFill(entry?.bin_fill_after)}`,
    ]
    if (reading(entry?.tonnes_after) > 0) {
      parts.push(`${formatLogTonnes(entry?.tonnes_after)} left in chaser`)
    }
    return { title: `${vehicleName} → ${binName}`, detail: parts.join(" · ") }
  }

  if (action === "chaser.level") {
    const delta = tonnesDelta(entry?.tonnes_before, entry?.tonnes_after)
    return {
      title: vehicleName,
      detail: `Load ${formatLogTonnes(entry?.tonnes_after)}${
        delta ? ` (${delta})` : ""
      }`,
    }
  }

  // bin.level (and anything added later that follows the same shape)
  const delta = tonnesDelta(entry?.tonnes_before, entry?.tonnes_after)
  return {
    title: binName,
    detail: `${formatFill(entry?.bin_fill_after)} · ${formatLogTonnes(
      entry?.tonnes_after,
    )}${delta ? ` (${delta})` : ""}`,
  }
}
