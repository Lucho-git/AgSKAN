#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// app-release.mjs — ONE app version for both stores (iOS + Android)
//
//   npm run build:app             patch bump (2.95 → 2.96) + build + sync
//   npm run build:app 296         set an exact versionCode (name → 2.96)
//   npm run build:app 2.96        set an exact versionName
//   npm run build:app:major       3.0
//   npm run build:app:rebuild     NO bump — re-sync versions, then build
//   ... --dry-run | --no-build | --no-sync | --force
//   (With the npm aliases, flags need `--`, e.g. `npm run build:app -- 296 --dry-run`.)
//
// version.json is the SINGLE SOURCE OF TRUTH. Every run rewrites all three
// platform files from it, so they cannot drift apart:
//     - capacitor.config.ts       (android block — used by cap tooling)
//     - android/app/build.gradle  (the version actually installed on the APK)
//     - ios/.../project.pbxproj   (MARKETING_VERSION + CURRENT_PROJECT_VERSION)
//
// Two-machine flow (Windows build Android, Mac archives iOS):
//   1. on ONE machine:  npm run build:app 96          ← bump exactly once
//   2. commit + push the version files
//   3. on the other:    git pull && npm run build:app:rebuild
//      (rebuild = no bump. Running a *bump* on both machines is what used to
//       leave Android and iOS on different versions.)
//
// Version scheme — identical to the app's historical versions:
//     versionName = MAJOR.MINOR            e.g. "2.95"  → CFBundleShortVersionString
//     versionCode = MAJOR * 100 + MINOR    e.g. 295     → Play versionCode AND
//                                                        Xcode build number
//     (history: 287 ↔ "2.87", 291 ↔ "2.91" ✓)
//
// ⚠ The App Store rule that rejected the 2.9.4 build (error 90062):
//   iOS compares CFBundleShortVersionString component-by-component and
//   NUMERICALLY, so "2.9.4" → (2, 9, 4) sorts BELOW the approved "2.91"
//   → (2, 91) because 9 < 91. The upload is refused with "must contain a
//   higher version than that of the previously approved version".
//   Never use 2.9.x names again. `minVersionName` in version.json is the
//   floor (the last version Apple approved, +1) and is enforced below.
// ─────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const versionPath = resolve(root, "version.json")
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
const capCodeN = parseInt(
  capAndroid.match(/versionCode:\s*(\d+)/)?.[1] ?? "",
  10,
)

const gradleName = gradleSrc.match(/versionName\s+"([^"]+)"/)?.[1]
const gradleCodeN = parseInt(
  gradleSrc.match(/versionCode\s+(\d+)/)?.[1] ?? "",
  10,
)

const iosExists = existsSync(iosPath)
const iosSrc = iosExists ? readFileSync(iosPath, "utf8") : ""
// MARKETING_VERSION / CURRENT_PROJECT_VERSION appear once per build
// configuration (Debug/Release) — all of them are rewritten together below.
const iosName = iosSrc.match(/MARKETING_VERSION = ([^;]+);/)?.[1]
const iosCodeN = parseInt(
  iosSrc.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1] ?? "",
  10,
)

if (!capName || !Number.isFinite(capCodeN)) {
  console.error(
    "Could not find versionName/versionCode in the capacitor.config.ts android block",
  )
  process.exit(1)
}

// ── compare dotted names the way the App Store does ─────────────────────
// Component-by-component, numerically, missing components = 0. So
// "2.95" > "2.9.4" (95 > 9) while "2.9.1" < "2.91" — which is exactly the
// trap that got the 2.9.4 upload rejected (error 90062).
function cmpNames(a, b) {
  const pa = String(a)
    .split(".")
    .map((n) => parseInt(n, 10) || 0)
  const pb = String(b)
    .split(".")
    .map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

// version.json is the single source of truth. First run seeds it from the
// highest versionCode found in the files (never move backwards).
if (!existsSync(versionPath)) {
  const seedCode = Math.max(capCodeN || 0, gradleCodeN || 0, iosCodeN || 0)
  const seedName =
    capCodeN === seedCode
      ? capName
      : gradleCodeN === seedCode
        ? gradleName || capName
        : iosName || capName
  if (!DRY_RUN) {
    writeFileSync(
      versionPath,
      `${JSON.stringify(
        {
          versionName: seedName,
          versionCode: seedCode,
          minVersionName: seedName,
        },
        null,
        2,
      )}\n`,
    )
  }
  console.log(
    `ℹ Seeded version.json from the current files: ${seedName} (${seedCode})`,
  )
}

const versionJson = JSON.parse(readFileSync(versionPath, "utf8"))
const curName = versionJson.versionName
const curCode = versionJson.versionCode
// Floor for the iOS marketing version: the last version Apple APPROVED (+1).
// Anything at or below it is rejected with error 90062.
const minVersionName = versionJson.minVersionName || curName

if (!curName || !Number.isFinite(curCode)) {
  console.error("version.json must contain versionName and versionCode")
  process.exit(1)
}

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
const majorOf = (name) => parseInt(String(name).split(".")[0], 10) || 0
const minorOf = (name) => parseInt(String(name).split(".")[1], 10) || 0

// versionCode ⇄ versionName: MAJOR * 100 + MINOR  (2.95 → 295).
// This is the app's historical mapping — 2.87 → 287, 2.91 → 291 — so the
// build numbers keep climbing from where Play/App Store already are.
const codeFromName = (name) => majorOf(name) * 100 + minorOf(name)

let nextName
let nextCode
let modeLabel = mode

if (isExactCode) {
  // bare digits → set the versionCode, derive the name from the current major
  nextCode = parseInt(mode, 10)
  const minor = nextCode - majorOf(curName) * 100
  if (minor < 0) {
    console.error(
      `versionCode ${nextCode} is below ${majorOf(curName)}xx — pass the versionName instead, e.g. \`npm run build:app 3.0\`.`,
    )
    process.exit(1)
  }
  nextName = `${majorOf(curName)}.${minor}`
  modeLabel = `code ${mode}`
} else if (isExactName) {
  nextName = mode
  nextCode = codeFromName(nextName)
} else if (mode === "none") {
  // plain rebuild — re-assert the canonical version, never bump
  nextName = curName
  nextCode = curCode
} else {
  const maj = majorOf(curName)
  const min = minorOf(curName)
  if (mode === "major") {
    nextName = `${maj + 1}.0`
  } else {
    // patch and minor are the same thing while the name is MAJOR.MINOR:
    // every release advances MINOR by one (2.95 → 2.96)
    nextName = `${maj}.${min + 1}`
  }
  nextCode = codeFromName(nextName)
}

// ── guards ──────────────────────────────────────────────────────────────
if (mode !== "none" && !FORCE) {
  if (cmpNames(nextName, curName) <= 0) {
    console.error(
      `Refusing to write versionName ${nextName} — it must be higher than ${curName}.` +
        (isExactCode ? `\n  (versionCode ${mode} is not above ${curCode}.)` : "") +
        `\n  Apple compares these component-by-component, so 2.9.x sorts BELOW 2.91 (error 90062).`,
    )
    process.exit(1)
  }
  if (nextCode <= curCode) {
    console.error(
      `Refusing to write versionCode ${nextCode} — it must be greater than the current ${curCode}.\n  (Pass --force only if ${curCode} was never uploaded to Play.)`,
    )
    process.exit(1)
  }
}

// The iOS marketing version has to beat the last version Apple approved.
if (cmpNames(nextName, minVersionName) < 0 && !FORCE) {
  console.error(
    `Refusing to write versionName ${nextName} — it is below the App Store floor ${minVersionName} (minVersionName in version.json).\n  Apple rejects any CFBundleShortVersionString that is not higher than the approved version (error 90062).`,
  )
  process.exit(1)
}

// Never move a file backwards: a stale version.json would otherwise silently
// downgrade a machine that is already carrying the newer version.
if (!FORCE) {
  for (const [label, name, code] of [
    ["capacitor.config.ts", capName, capCodeN],
    ["android/app/build.gradle", gradleName, gradleCodeN],
    ["ios/App/App.xcodeproj/project.pbxproj", iosName, iosCodeN],
  ]) {
    if (!name || !Number.isFinite(code)) continue
    if (cmpNames(nextName, name) < 0 || nextCode < code) {
      console.error(
        `Refusing to write ${nextName} (${nextCode}) — ${label} already has ${name} (${code}).\n  Run \`git pull\` first, or pass --force if that file is wrong.`,
      )
      process.exit(1)
    }
  }
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

// version.json records what we just released, so the next run (on either
// machine) bumps from here instead of re-deriving from stale files.
if (!DRY_RUN && (nextName !== curName || nextCode !== curCode)) {
  writeFileSync(
    versionPath,
    `${JSON.stringify(
      { ...versionJson, versionName: nextName, versionCode: nextCode },
      null,
      2,
    )}\n`,
  )
  console.log(`  version.json → ${nextName} (${nextCode})`)
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
    console.log("(–no-sync: skipping npx cap sync)")
  } else {
    run("Capacitor sync (android)", "npx cap sync android")
    // The Mac needs the iOS copy too; CocoaPods only exists on macOS.
    if (process.platform === "darwin" && iosExists) {
      run("Capacitor sync (ios)", "npx cap sync ios")
    }
  }
}

console.log(
  `\n✅ Done — app v${nextName} (versionCode ${nextCode}).
   Both stores read the same version now:
     Android  versionName "${nextName}" / versionCode ${nextCode}
     iOS      MARKETING_VERSION ${nextName} / build ${nextCode}
   Next steps:
     1. commit + push the version files (incl. version.json)
     2. Android: cd android; .\\gradlew.bat bundleRelease   (or Android Studio)
     3. iOS on the Mac: git pull && npm run build:app:rebuild, then Archive
        (do NOT run a bump again there — that is what used to leave the two
         platforms on different versions)
     4. after Apple approves ${nextName}, raise minVersionName in version.json\n`,
)
