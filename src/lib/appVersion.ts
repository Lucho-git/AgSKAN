// Build-time snapshot of the released app version.
//
// version.json at the repo root is the single source of truth (maintained by
// scripts/app-release.mjs — `npm run build:app`). Importing it here means the
// web build always displays the version it shipped from, with no env vars to
// go stale.
//
// Native platforms override this with the REAL installed version via
// Capacitor App.getInfo() (see settings/app-information) — this is the web
// fallback.
import versionData from "../../version.json"

export const APP_VERSION_NAME: string = versionData.versionName

export const APP_VERSION_CODE: number = versionData.versionCode

export const APP_VERSION_LABEL = `${versionData.versionName} (${versionData.versionCode})`
