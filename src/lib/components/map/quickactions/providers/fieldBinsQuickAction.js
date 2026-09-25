// fieldBinsQuickAction.js — quick-action provider: one circular button per
// grain bin on the map (field bin + mother bin — bin glyph in its grain
// colour + fill level bar + what it's storing as the side tag).
//
// Visibility is PER BIN (marker property `binShowAlways`): on by default —
// every bin gets a button from the moment it's placed — and turning a bin
// off in its panel/modal removes just that bin's button from the rail.

import {
  grainBinName,
  isGrainBinIcon,
  markerColor,
  siloColorKey,
} from "$lib/components/map/markers/markerPalette"
import { grainBinGlyphSvg } from "../fieldBinGlyph"

/**
 * @param {{ openBin: (markerId: string) => void }} deps
 */
export function createFieldBinsQuickAction({ openBin }) {
  return {
    id: "field-bins",
    order: 10,
    getItems({ markers, glyph, canEdit }) {
      // Read-only guests never get the bin rail section.
      if (!canEdit) return []
      return (markers || [])
        .filter(
          (m) => isGrainBinIcon(m.iconClass) && m.binShowAlways !== false,
        )
        .map((m) => {
          const def = markerColor(siloColorKey(m.grainColor), "original")
          const fill = Math.max(0, Math.min(100, Number(m.siloFill) || 0))
          const capacity = Number(m.capacityTonnes) || 0
          const tonnes = capacity > 0 ? (capacity * fill) / 100 : 0
          const name = m.notes?.trim() || grainBinName(m.iconClass)
          const contents = (m.grainType || "").trim()
          // Tonnes currently stored, shown as a number on the rail button
          // (whole tonnes once past 10; one decimal below that so small
          // testing amounts stay readable). Null when no bin size is set.
          const tonnesLabel =
            capacity > 0
              ? `${tonnes >= 10 ? Math.round(tonnes) : tonnes.toFixed(1)} t`
              : null
          return {
            id: `grain-bin-${m.id}`,
            label: `Bin shortcut: ${name}`,
            title: `${name} — ${Math.round(fill)}%${
              capacity > 0 ? ` · ${tonnes.toFixed(1)} t` : ""
            }${contents ? ` · ${contents}` : ""}`,
            // Map-faithful button: pale grain disc + dark ring, dark glyph —
            // exactly how the bin renders on the map itself.
            accent: def.dark,
            bg: def.light,
            fill,
            // Stored tonnes — rendered as a number badge on the disc.
            tonnes: tonnesLabel,
            iconSvg: grainBinGlyphSvg(m.iconClass, "#111827", 30, glyph),
            // Side tag: what the bin is storing (empty = no tag shown).
            text: contents || null,
            onActivate: () => openBin(m.id),
          }
        })
    },
  }
}
