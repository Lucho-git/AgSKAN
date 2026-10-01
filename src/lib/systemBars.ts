// Single source of truth for the native "screen header" — the status bar and
// system bars on Android and iOS.
//
// The APP's own theme attribute (document.documentElement data-theme:
// "skanthemedark" / "skantheme", persisted in localStorage) drives everything
// — NOT the system dark/light preference. A MutationObserver keeps the bars
// in sync whenever the theme is toggled anywhere in the app, so this module is
// the only wiring point and the bars can never drift from the app's theme.
//
// Mapping (matches the app's existing brand palette):
//   dark app theme  → yellow bars  #f9e58a + dark icons
//   light app theme → dark bars    #102030 + light icons
import { Capacitor, registerPlugin } from "@capacitor/core"
import { StatusBar, Style as StatusBarStyle } from "@capacitor/status-bar"

export const SYSTEM_BARS_DARK_APP_BG = "#f9e58a" // dark app theme → yellow
export const SYSTEM_BARS_LIGHT_APP_BG = "#102030" // light app theme → dark grey

const DARK_APP_THEME = "skanthemedark"

// iOS only: the web view is inset below the status bar, so the strip behind it
// is the native window/view background — this plugin paints it and sets the
// icon style. (Android does both from JS below.)
interface SystemBarsThemePlugin {
  setTheme(options: { dark: boolean }): Promise<void>
}
const SystemBarsTheme = registerPlugin<SystemBarsThemePlugin>("SystemBarsTheme")

/**
 * Is the app currently in its dark theme? Falls back to the system preference
 * only when no app theme attribute exists yet (matches the seeding convention
 * used by the layouts before the user ever toggles).
 */
export function getAppThemeIsDark(): boolean {
  if (typeof document === "undefined") return false
  const attr = document.documentElement.getAttribute("data-theme")
  if (attr) return attr === DARK_APP_THEME
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
}

/** Apply the app-theme colours to the native status/navigation bars. */
export async function applySystemBarsTheme(isDarkApp?: boolean): Promise<void> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return

  const dark = isDarkApp ?? getAppThemeIsDark()
  const platform = Capacitor.getPlatform()

  try {
    if (platform === "android") {
      // 1) Bars background (top + bottom) via the edge-to-edge plugin.
      try {
        const { EdgeToEdge } = await import(
          "@capawesome/capacitor-android-edge-to-edge-support"
        )
        await EdgeToEdge.setBackgroundColor({
          color: dark ? SYSTEM_BARS_DARK_APP_BG : SYSTEM_BARS_LIGHT_APP_BG,
        })
      } catch (error) {
        console.warn("SystemBars: EdgeToEdge.setBackgroundColor failed:", error)
      }

      // 2) Icon/text style — deliberately independent of (1): a failure in
      //    either half must not leave icons unreadable against the bar.
      try {
        await StatusBar.setStyle({
          style: dark ? StatusBarStyle.Dark : StatusBarStyle.Light,
        })
        await StatusBar.show()
      } catch (error) {
        console.warn("SystemBars: StatusBar.setStyle failed:", error)
      }
    } else if (platform === "ios") {
      await SystemBarsTheme.setTheme({ dark })
    }
  } catch (error) {
    console.warn("SystemBars: failed to apply theme:", error)
  }
}

let started = false

/**
 * Apply once and watch the app theme attribute forever. Call on app init;
 * safe to call multiple times.
 */
export function initSystemBars(): void {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return

  applySystemBarsTheme()

  if (!started) {
    started = true
    new MutationObserver(() => {
      applySystemBarsTheme()
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
  }
}
