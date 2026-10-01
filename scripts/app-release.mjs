#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// app-release.mjs — Android release version bump + web build + cap sync
//
// One command for the whole loop:
//   1. bump the app version (default: patch)
//   2. write the SAME versionName/versionCode into BOTH
//        - capacitor.config.ts        (android block — used by cap tooling)
//        - android/app/build.gradle   (the REAL installed APK version)
//      `npx cap sync` only regenerates the assets capacitor.config.json —
//      it never fixes build.gradle, which is how the two drift apart.
//   3. npm run build          (web assets → build/)
//   4. npx cap sync android   (copy web assets + plugins into the app)
//
// Usage (from the repo root):
//   npm run app:release              patch bump + build + sync
//   npm run app:release:minor        minor bump + build + sync
//   npm run app:release:major        major bump + build + sync
//   npm run app:rebuild              NO bump; enforce matching versions,
//                                    then build + sync (plain rebuild)
//   node scripts/app-release.mjs 2.10.0        set an exact version
//   node scripts/app-release.mjs patch --dry-run        preview only
//   node scripts/app-release.mjs none --no-build --no-sync    versions only
//   ... --force        allow a LOWER versionCode (only when the current one
//                      was never uploaded to Play, e.g. resetting a mistake)
//
// Version scheme: versionName is MAJOR.MINOR.PATCH (e.g. 2.9.2).
// versionCode is the version digits concatenated: 2.9.2 → 292 (matching the
// app's historical codes: 2.9.1 was 291, 2.9.0 was 290). Multi-digit parts
// just extend the number (2.10.0 → 2100) — mind that patch ≥ 10 can outrun
// the next minor (2.9.10 → 2910 > 2.10.0 → 2100), which the guard will flag.
// ─────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const capPath = resolve(root, "capacitor.config.ts")
const gradlePath = resolve(root, "android/app/build.gradle")

// ── args ────────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter((a) => a.startsWith("--")))
const mode = (rawArgs.find((a) => !a.startsWith("--")) || "patch").toLowerCase()

const DRY_RUN = flags.has("--dry-run")
const NO_BUILD = flags.has("--no-build")
const NO_SYNC = flags.has("--no-sync")
const FORCE = flags.has("--force")

if (flags.has("--help") || flags.has("-h")) {
  console.log(
    "Usage: node scripts/app-release.mjs [patch|minor|major|none|X.Y.Z] [--dry-run] [--no-build] [--no-sync] [--force]",
  )
  process.exit(0)
}

const isExactVersion = /^\d+(\.\d+){0,2}$/.test(mode)
if (!isExactVersion && !["patch", "minor", "major", "none"].includes(mode)) {
  console.error(
    `Unknown bump mode "${mode}" — use patch | minor | major | none | X.Y.Z`,
  )
  process.exit(1)
}

// ── read current versions ───────────────────────────────────────────────
const capSrc = readFileSync(capPath, "utf8")
const gradleSrc = readFileSync(gradlePath, "utf8")

const androidIdx = capSrc.indexOf("android:")
if (androidIdx === -1) {
  console.error("Could not find the android block in capacitor.config.ts")
  process.exit(1)
}
const capAndroid = capSrc.slice(androidIdx)
const capName = capAndroid.match(/versionName:\s*"([^"]+)"/)?.[1]
const capCode = capAndroid.match(/versionCode:\s*(\d+)/)?.[1]

const gradleName = gradleSrc.match(/versionName\s+"([^"]+)"/)?.[1]
const gradleCode = gradleSrc.match(/versionCode\s+(\d+)/)?.[1]

if (!capName || !capCode) {
  console.error(
    "Could not find versionName/versionCode in the capacitor.config.ts android block",
  )
  process.exit(1)
}

const capCodeN = parseInt(capCode, 10)
const gradleCodeN = gradleCode ? parseInt(gradleCode, 10) : 0

// Canonical = whichever file carries the HIGHER versionCode (never move
// backwards — Play rejects reused/regressed codes), preferring the config
// on ties (its versionName is the better-formatted one).
const curName = capCodeN >= gradleCodeN ? capName : gradleName || capName
const curCode = Math.max(capCodeN, gradleCodeN)

if (capName !== gradleName || capCodeN !== gradleCodeN) {
  console.log(
    `⚠ Version drift detected:\n    capacitor.config.ts  → ${capName} (${capCodeN})\n    android/app/build.gradle → ${gradleName ?? "?"} (${gradleCodeN})\n  This run will make both match.`,
  )
}

// ── compute the next version ────────────────────────────────────────────
function parseV(v) {
  const [maj = 0, min = 0, pat = 0] = v.split(".").map((n) => parseInt(n, 10))
  return { maj, min, pat }
}

let next
if (isExactVersion) {
  next = parseV(mode)
} else if (mode === "none") {
  next = parseV(curName)
} else {
  const c = parseV(curName)
  if (mode === "major") next = { maj: c.maj + 1, min: 0, pat: 0 }
  else if (mode === "minor") next = { maj: c.maj, min: c.min + 1, pat: 0 }
  else next = { maj: c.maj, min: c.min, pat: c.pat + 1 }
}

if (next.min < 0 || next.pat < 0) {
  console.error("Version components must be non-negative integers.")
  process.exit(1)
}

const nextName = `${next.maj}.${next.min}.${next.pat}`
// "none" writes the current values verbatim (a rebuild must not bump the code)
const nextCode =
  mode === "none"
    ? curCode
    : parseInt(`${next.maj}${next.min}${next.pat}`, 10)

if (mode !== "none" && nextCode <= curCode && !FORCE) {
  console.error(
    `Refusing to write versionCode ${nextCode} — it must be greater than the current ${curCode}.\n  (Pass --force only if ${curCode} was never uploaded to Play.)`,
  )
  process.exit(1)
}

console.log(
  `\n📦 App version: ${curName} (${curCode})  →  ${nextName} (${nextCode})  [mode: ${mode}]${DRY_RUN ? "  (dry run)" : ""}\n`,
)

// ── file rewrites ───────────────────────────────────────────────────────
const newCapSrc = capSrc
  .replace(/versionName:\s*"[^"]+"/, () => `versionName: "${nextName}"`)
  .replace(/versionCode:\s*\d+/, () => `versionCode: ${nextCode}`)

const newGradleSrc = gradleSrc
  .replace(/versionCode\s+\d+/, () => `versionCode ${nextCode}`)
  .replace(/versionName\s+"[^"]+"/, () => `versionName "${nextName}"`)

if (newCapSrc === capSrc && newGradleSrc === gradleSrc) {
  console.log("✓ Files already up to date — nothing to rewrite.")
} else {
  if (newCapSrc !== capSrc) {
    console.log(`  capacitor.config.ts  → versionName "${nextName}", versionCode ${nextCode}`)
  }
  if (newGradleSrc !== gradleSrc) {
    console.log(`  android/app/build.gradle → versionName "${nextName}", versionCode ${nextCode}`)
  }
  if (!DRY_RUN) {
    writeFileSync(capPath, newCapSrc)
    writeFileSync(gradlePath, newGradleSrc)
    console.log("✓ Version files written.")
  }
}

// ── build + sync ────────────────────────────────────────────────────────
function run(label, cmd) {
  console.log(`\n⏳ ${label}: ${cmd}`)
  execSync(cmd, { cwd: root, stdio: "inherit" })
}

if (DRY_RUN) {
  console.log("\n(dry run — skipping build + cap sync)")
} else {
  if (NO_BUILD) {
    console.log("\n(–no-build: skipping npm run build)")
  } else {
    run("Web build", "npm run build")
  }

  if (NO_SYNC) {
    console.log("(–no-sync: skipping npx cap sync android)")
  } else {
    run("Capacitor sync", "npx cap sync android")
  }
}

console.log(
  `\n✅ Done — app v${nextName} (versionCode ${nextCode}).\n   Next: cd android; .\\gradlew.bat bundleRelease   (or build from Android Studio)\n`,
)
