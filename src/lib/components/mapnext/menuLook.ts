/**
 * How the new map's menus are dressed, chosen in the Map tool. Each is a
 * set of colours (see the "Nineteenth pass" in menus.css, keyed by the
 * `data-ui` attribute on the map's root):
 *  - "contrast": dark headings on light menus
 *  - "light":    light all through, nothing dark
 *  - "yellow":   AgSKAN yellow headings on light menus
 *  - "dark":     dark all through
 */
export type MenuLook = "contrast" | "light" | "yellow" | "dark"

export const MENU_LOOKS: { key: MenuLook; label: string }[] = [
  { key: "contrast", label: "Dark top" },
  { key: "light", label: "Light" },
  { key: "yellow", label: "Yellow top" },
  { key: "dark", label: "Dark" },
]

/** A saved choice (or anything else) as one of the looks. */
export const asMenuLook = (saved: unknown): MenuLook =>
  saved === "light" || saved === "yellow" || saved === "dark"
    ? saved
    : "contrast"
