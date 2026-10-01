#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// app-release.mjs — Android release version bump + web build + cap sync
//
// One command for the whole loop:
//   1. bump the app version (default: patch)
//   2. write the SAME versionName/versionCode into ALL of
//        - capacitor.config.ts        (android block — used by cap tooling)
//        - android/app/build.gradle   (the REAL installed APK version)
//        - ios/App/App.xcodeproj/project.pbxproj
//          (MARKETING_VERSION + CURRENT_PROJECT_VERSION — the values Xcode
//          shows/archives with, so the Mac needs no manual version edits;
//          just git pull there)
//      `npx cap sync` only regenerates the assets capacitor.config.json —
//      it never fixes build.gradle or the Xcode project, which is how they
//      drift apart.
//   3. npm run build          (web assets → build/)
//   4. npx cap sync android   (copy web assets + plugins into the app)
//
// Usage (from the repo root):
//   npm run app:release              patch bump + build + sync
//   npm run app:release:minor        minor bump + build + sync
//   npm run app:release:major        major bump + build + sync
//   npm run app:rebuild              NO bump; enforce matching versions,
//                                    then build + sync (plain rebuild)
//   node scripts/app-release.mjs 2.10.0        set an exact versionName
//   npm run app:build 293                      set an exact versionCode
//                                              (name derived: 2.9.3)
//   node scripts/app-release.mjs patch --dry-run        preview only
//   node scripts/app-release.mjs none --no-build --no-sync    versions only
//   ... --force        allow a LOWER versionCode (only when the current one
//                      was never uploaded to Play, e.g. resetting a mistake)
//
// (With the npm aliases, flags that look like npm options need `--`, e.g.
//  `npm run app:build -- 293 --dry-run`.)
//
// Version scheme: versionName is MAJOR.MINOR.PATCH (e.g. 2.9.2).
// versionCode is the version digits concatenated: 2.9.2 → 292 (matching the
// app's historical codes: 2.9.1 was 291, 2.9.0 was 290). Multi-digit parts
// just extend the number (2.10.0 → 2100) — mind that patch ≥ 10 can outrun
// the next minor (2.9.10 → 2910 > 2.10.0 → 2100), which the guard will flag.
// ─────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const capPath = resolve(root, "capacitor.config.ts")
const gradlePath = resolve(root, "android/app/build.gradle")
const iosPath = resolve(root, "ios/App/App.xcodeproj/project.pbxproj")

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
    "Usage: node scripts/app-release.mjs [patch|minor|major|none|X.Y.Z|<versionCode>] [--dry-run] [--no-build] [--no-sync] [--force]",
  )
  process.exit(0)
}

// "2.9.3" / "3.0" = explicit versionName; "293" (bare digits) = explicit
// versionCode with the matching name derived (293 → 2.9.3)
const isExactName = /^\d+\.\d+(\.\d+)?$/.test(mode)
const isExactCode = /^\d+$/.test(mode)
if (
  !isExactName &&
  !isExactCode &&
  !["patch", "minor", "major", "none"].includes(mode)
) {
  console.error(
    `Unknown bump mode "${mode}" — use patch | minor | major | none | X.Y.Z | <versionCode>`,
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

const iosExists = existsSync(iosPath)
const iosSrc = iosExists ? readFileSync(iosPath, "utf8") : ""
const iosName = iosSrc.match(/MARKETING_VERSION = ([^;]+);/)?.[1]
const iosCode = iosSrc.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1]

if (!capName || !capCode) {
  console.error(
    "Could not find versionName/versionCode in the capacitor.config.ts android block",
  )
  process.exit(1)
}

const capCodeN = parseInt(capCode, 10)
const gradleCodeN = gradleCode ? parseInt(gradleCode, 10) : 0
const iosCodeN = iosCode ? parseInt(iosCode, 10) : 0

// Canonical = whichever file carries the HIGHER versionCode (never move
// backwards — Play/App Store reject reused or regressed build numbers),
// preferring the config on ties (its versionName is the better-formatted one).
const curCode = Math.max(capCodeN, gradleCodeN, iosCodeN)
const curName =
  capCodeN === curCode
    ? capName
    : gradleCodeN === curCode
      ? gradleName || capName
      : iosName || capName

const drift = []
if (capName !== curName || capCodeN !== curCode) {
  drift.push(`    capacitor.config.ts  → ${capName} (${capCodeN})`)
}
if (gradleName !== curName || gradleCodeN !== curCode) {
  drift.push(
    `    android/app/build.gradle → ${gradleName ?? "?"} (${gradleCodeN})`,
  )
}
if (iosExists && (iosName !== curName || iosCodeN !== curCode)) {
  drift.push(
    `    ios/App/App.xcodeproj/project.pbxproj → ${iosName ?? "?"} (${iosCodeN})`,
  )
}

if (drift.length > 0) {
  console.log(
    `⚠ Version mismatch between files:\n${drift.join("\n")}\n  (all are synced to ${curName} (${curCode}) by the next release run)`, 
  )
}

// ── compute the next version ────────────────────────────────────────────
function parseV(v) {
  const [maj = 0, min = 0, pat = 0] = v.split(".").map((n) => parseInt(n, 10))
  return { maj, min, pat }
}

// Rebuild the versionName from a bare versionCode by keeping the current
// major: 293 → 2.9.3, 2100 → 2.10.0 (middle digits become minor, last digit
// the patch). Ambiguous codes like 2910 (2.9.10 vs 2.91.0) resolve to the
// larger-minor reading — pass the full X.Y.Z form instead when it matters.
function nameFromCode(codeStr, cur) {
  const curMajStr = String(cur.maj)
  const majStr =
    codeStr.startsWith(curMajStr) && codeStr.length > curMajStr.length
      ? curMajStr
      : codeStr[0]
  let rest = codeStr.slice(majStr.length)
  if (rest.length === 0) rest = "0"
  const pat = rest.length >= 2 ? parseInt(rest.slice(-1), 10) : 0
  const min = parseInt(rest.length >= 2 ? rest.slice(0, -1) : rest, 10)
  return { maj: parseInt(majStr, 10), min, pat }
}

let next
let modeLabel = mode
if (isExactCode) {
  next = nameFromCode(mode, parseV(curName))
  modeLabel = `code ${mode}`
} else if (isExactName) {
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
    : isExactCode
      ? parseInt(mode, 10)
      : parseInt(`${next.maj}${next.min}${next.pat}`, 10)

if (isExactCode && `${next.maj}${next.min}${next.pat}` !== mode) {
  console.log(
    `⚠ versionCode ${mode} does not match the digits of ${nextName} — writing exactly what you asked for.`,
  )
}

if (mode !== "none" && nextCode <= curCode && !FORCE) {
  console.error(
    `Refusing to write versionCode ${nextCode} — it must be greater than the current ${curCode}.\n  (Pass --force only if ${curCode} was never uploaded to Play.)`,
  )
  process.exit(1)
}

console.log(
  `\n📦 App version: ${curName} (${curCode})  →  ${nextName} (${nextCode})  [mode: ${modeLabel}]${DRY_RUN ? "  (dry run)" : ""}\n`,
)

// ── file rewrites ───────────────────────────────────────────────────────
const newCapSrc = capSrc
  .replace(/versionName:\s*"[^"]+"/, () => `versionName: "${nextName}"`)
  .replace(/versionCode:\s*\d+/, () => `versionCode: ${nextCode}`)

const newGradleSrc = gradleSrc
  .replace(/versionCode\s+\d+/, () => `versionCode ${nextCode}`)
  .replace(/versionName\s+"[^"]+"/, () => `versionName "${nextName}"`)

// Xcode stores the version in the pbxproj as MARKETING_VERSION (="2.9.3")
// and CURRENT_PROJECT_VERSION (build number = our versionCode); the values
// appear once per build configuration (Debug/Release), so replace them all.
const newIosSrc = iosExists
  ? iosSrc
      .replace(
        /CURRENT_PROJECT_VERSION = \d+;/g,
        () => `CURRENT_PROJECT_VERSION = ${nextCode};`,
      )
      .replace(
        /MARKETING_VERSION = [^;]+;/g,
        () => `MARKETING_VERSION = ${nextName};`,
      )
  : ""

if (
  newCapSrc === capSrc &&
  newGradleSrc === gradleSrc &&
  newIosSrc === iosSrc
) {
  console.log("✓ Files already up to date — nothing to rewrite.")
} else {
  if (newCapSrc !== capSrc) {
    console.log(`  capacitor.config.ts  → versionName "${nextName}", versionCode ${nextCode}`)
  }
  if (newGradleSrc !== gradleSrc) {
    console.log(`  android/app/build.gradle → versionName "${nextName}", versionCode ${nextCode}`)
  }
  if (iosExists && newIosSrc !== iosSrc) {
    console.log(`  ios/App/App.xcodeproj/project.pbxproj → MARKETING_VERSION ${nextName}, CURRENT_PROJECT_VERSION ${nextCode}`)
  }
  if (!DRY_RUN) {
    writeFileSync(capPath, newCapSrc)
    writeFileSync(gradlePath, newGradleSrc)
    if (iosExists) writeFileSync(iosPath, newIosSrc)
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
  `\n✅ Done — app v${nextName} (versionCode ${nextCode}).\n   Android: cd android; .\\gradlew.bat bundleRelease   (or build from Android Studio)\n   iOS: git pull on the Mac — Xcode already shows v${nextName} (${nextCode}) from the project file.\n`,
)
