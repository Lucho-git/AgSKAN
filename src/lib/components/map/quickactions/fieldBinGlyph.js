// fieldBinGlyph.js — lazy loader + tinted-SVG builder for the GRAIN-BIN
// glyphs (Field Bin + Mother Bin), shared by the quick-action rail and the
// bin quick modal.
//
// The heavy marker-glyph payload lives in /marker-svg-glyphs.json (fetched
// once; same pattern as markerSvgRenderer). While it loads — or if the fetch
// ever fails — a compact silo glyph stands in so the rail never shows a hole.

import { get, writable } from "svelte/store"
import {
  GRAIN_BIN_ICON_CLASS,
  GRAIN_BIN_ICON_CLASSES,
} from "$lib/components/map/markers/markerPalette"

/** { [iconClass]: { viewBox, content } } once loaded, else null. */
export const grainBinGlyphsStore = writable(null)

let glyphsPromise = null

export function loadGrainBinGlyphs() {
  if (!glyphsPromise) {
    glyphsPromise = fetch("/marker-svg-glyphs.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return null
        const glyphs = {}
        for (const iconClass of GRAIN_BIN_ICON_CLASSES) {
          if (json[iconClass]?.content) glyphs[iconClass] = json[iconClass]
        }
        if (Object.keys(glyphs).length) grainBinGlyphsStore.set(glyphs)
        return glyphs
      })
      .catch(() => null)
  }
  return glyphsPromise
}

// Compact silo fallback (same glyph the off-screen bin badges used).
const FALLBACK_SILO_PATH =
  "M12 2c-4 0-7 2-7 5v10a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V7c0-3-3-5-7-5zM7 7c0-1.7 2.2-3 5-3s5 1.3 5 3v2H7V7z"

/**
 * Inline <svg> markup of a bin glyph, tinted `color`, `size` px. Falls back
 * to the compact silo while the glyph payload loads (or for unknown icons).
 * @param {string | null | undefined} iconClass
 * @param {string} color
 * @param {number} size
 * @param {Record<string, { viewBox: string, content: string }> | null} [glyphs]
 */
export function grainBinGlyphSvg(
  iconClass,
  color,
  size = 26,
  glyphs = get(grainBinGlyphsStore),
) {
  const glyph = glyphs?.[iconClass || GRAIN_BIN_ICON_CLASS]
  if (glyph?.content && glyph?.viewBox) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${glyph.viewBox}" width="${size}" height="${size}"><g fill="${color}">${glyph.content}</g></svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}"><path d="${FALLBACK_SILO_PATH}"/></svg>`
}
