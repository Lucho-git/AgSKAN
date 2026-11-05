// src/lib/settings/settingsNav.ts
//
// Single source of truth for the settings information architecture.
//
// The old page was a flat list of seven equal-weight links, which made it hard
// to answer "where would that live?". Grouping by intent — you, your map,
// alerts, account — gives each destination a home and lets the labels carry
// the meaning instead of relying on icon recognition.

export interface SettingsNavItem {
  id: string
  href: string
  /** Full label used in sidebars and lists. */
  label: string
  /** Compact label for rails / tabs. */
  shortLabel: string
  icon: string
  /** One-line description: what you'd come here to change. */
  description: string
}

export interface SettingsNavGroup {
  id: string
  label: string
  items: SettingsNavItem[]
}

export const SETTINGS_BASE = "/account/settings"

export const settingsNavGroups: SettingsNavGroup[] = [
  {
    id: "you",
    label: "You",
    items: [
      {
        id: "profile",
        href: `${SETTINGS_BASE}/profile`,
        label: "Your profile",
        shortLabel: "Profile",
        icon: "solar:user-bold-duotone",
        description: "Name, company and contact details",
      },
      {
        id: "security",
        href: `${SETTINGS_BASE}/security`,
        label: "Sign-in & security",
        shortLabel: "Security",
        icon: "solar:shield-user-bold-duotone",
        description: "Password, devices and access",
      },
    ],
  },
  {
    id: "map",
    label: "Your map",
    items: [
      {
        id: "map-preferences",
        href: `${SETTINGS_BASE}/map-preferences`,
        label: "Map & display",
        shortLabel: "Map",
        icon: "solar:map-bold-duotone",
        description: "Base map, marker tint and layer defaults",
      },
      {
        id: "location-permissions",
        href: `${SETTINGS_BASE}/location-permissions`,
        label: "Location & GPS",
        shortLabel: "GPS",
        icon: "solar:gps-bold-duotone",
        description: "Positioning and background tracking",
      },
    ],
  },
  {
    id: "alerts",
    label: "Alerts",
    items: [
      {
        id: "notifications",
        href: `${SETTINGS_BASE}/notifications`,
        label: "Notifications",
        shortLabel: "Alerts",
        icon: "solar:bell-bold-duotone",
        description: "Push, email and in-app alerts",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "subscription",
        href: `${SETTINGS_BASE}/subscription`,
        label: "Plan & billing",
        shortLabel: "Plan",
        icon: "solar:card-bold-duotone",
        description: "Seats, invoices and payment method",
      },
      {
        id: "app-information",
        href: `${SETTINGS_BASE}/app-information`,
        label: "About AgSKAN",
        shortLabel: "About",
        icon: "solar:info-circle-bold-duotone",
        description: "Version, updates and diagnostics",
      },
    ],
  },
]

/** Flat list, in menu order. */
export const settingsNavItems: SettingsNavItem[] = settingsNavGroups.flatMap(
  (group) => group.items,
)

export function findSettingsItem(
  section: string | null | undefined,
): SettingsNavItem | null {
  if (!section) return null
  return settingsNavItems.find((item) => item.id === section) ?? null
}

/** Which group a section belongs to (used for the "You / Profile" crumb). */
export function findSettingsGroup(
  section: string | null | undefined,
): SettingsNavGroup | null {
  if (!section) return null
  return (
    settingsNavGroups.find((group) =>
      group.items.some((item) => item.id === section),
    ) ?? null
  )
}

/** Case-insensitive match across label + description, for the search box. */
export function filterSettingsItems(query: string): SettingsNavItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return settingsNavItems
  return settingsNavItems.filter((item) =>
    `${item.label} ${item.shortLabel} ${item.description}`
      .toLowerCase()
      .includes(needle),
  )
}
