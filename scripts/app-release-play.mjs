#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// app-release-play.mjs — bump → build → bundle → publish to Google Play
//
//   npm run app:publish              patch bump (2.96 → 2.97) + full prod rollout
//   npm run app:publish:minor        same as patch (names are MAJOR.MINOR)
//   npm run app:publish:major        3.0
//   npm run app:publish:rebuild      NO bump — rebuild + re-upload current version
//   npm run app:publish:draft        bump + upload as a DRAFT release (not live)
//
//   ... -- --track beta --notes "Trail fixes" --fraction 0.1 --dry-run
//   ... -- --status draft          rehearsal: uploaded, but nothing goes live
//   ... -- --build-only            stop after the AAB is built
//   ... -- --commit --push         also commit/push the version files
//
// Everything the release needs lives in this one command:
//   1. scripts/app-release.mjs  → bump version.json + capacitor/gradle/iOS
//   2. npm run build             → SvelteKit web build
//   3. npx cap sync android      → copy web assets into the native project
//   4. gradlew bundleRelease     → signed app-release.aab
//   5. scripts/play-publish.mjs  → upload + rollout via the Play Developer API
//
// One-time setup (service account + upload key) is in docs/play-release.md.
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync, execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { findKeytool, normalizeFingerprint, printJarSignerSha256 } from "./lib/java-tools.mjs"
import { readJson } from "./lib/json.mjs"
import { DEFAULT_AAB, explainPlayError, findCredentials, publishBundle, readTrack } from "./play-publish.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const androidDir = resolve(root, "android")
const gradlew = resolve(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew")
const keystoreProperties = resolve(androidDir, "keystore.properties")
const versionPath = resolve(root, "version.json")
const versionFiles = [
  "version.json",
  "capacitor.config.ts",
  "android/app/build.gradle",
  "ios/App/App.xcodeproj/project.pbxproj",
]

// ── args ────────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2)
const BOOLEAN_FLAGS = new Set([
  "dry-run",
  "no-bump",
  "no-web-build",
  "no-gradle",
  "build-only",
  "validate",
  "no-sign-check",
  "commit",
  "push",
  "help",
  "h",
])
const VALUE_FLAGS = new Set([
  "track",
  "status",
  "fraction",
  "notes",
  "notes-file",
  "notes-lang",
  "credentials",
  "aab",
  "package",
])
const args = { _: [] }
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i]
  if (!arg.startsWith("--")) {
    args._.push(arg)
    continue
  }
  const key = arg.slice(2)
  if (BOOLEAN_FLAGS.has(key) || rawArgs[i + 1]?.startsWith("--")) {
    args[key] = true
  } else {
    args[key] = rawArgs[i + 1]
    i++
  }
}

// Catch typos and pasted-together commands (e.g. `--build-onlynpm run ...`)
// instead of silently ignoring them.
for (const key of Object.keys(args)) {
  if (key === "_" || BOOLEAN_FLAGS.has(key) || VALUE_FLAGS.has(key)) continue
  const known = [...BOOLEAN_FLAGS, ...VALUE_FLAGS]
  const suggestion = known.find(
    (candidate) => candidate.startsWith(key) || key.startsWith(candidate),
  )
  console.error(
    [
      "",
      `✗ Unknown option --${key}`,
      suggestion ? `  Did you mean --${suggestion}?` : "",
      "  Run with --help to see the supported options.",
      "  (If two commands were pasted on one line, run them separately or join with ';'.)",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  )
  process.exit(1)
}
if (args._.length > 1) {
  console.error(
    `\n✗ Unexpected arguments: ${args._.slice(1).join(" ")}\n  Only one bump mode may be given (patch|minor|major|none|X.Y.Z|<versionCode>).\n`,
  )
  process.exit(1)
}

if (args.help || args.h) {
  console.log(
    `Usage: node scripts/app-release-play.mjs [patch|minor|major|none|X.Y.Z|<versionCode>] [options]

  --track <name>        production (default) | beta | alpha | internal
  --status <status>     completed (default, full rollout) | draft | halted
  --fraction <0-1>      staged rollout, e.g. 0.1 for 10%
  --notes "<text>"      release notes (default: "Version <name> (<code>)")
  --notes-file <path>   read release notes from a file
  --notes-lang <bcp47>  release notes language (default en-US)
  --credentials <path>  service-account JSON (default android/play-service-account.json)
  --no-bump             keep the current version (same as mode "none")
  --no-web-build        skip "npm run build"
  --no-gradle           skip gradle bundleRelease (upload the existing AAB)
  --build-only          stop after the AAB is built
  --dry-run             print the plan; nothing is written, built or uploaded
  --validate            ask Play to validate the edit before committing
  --no-sign-check       skip the "does this AAB look signed" check
  --commit              git commit the version files after a successful upload
  --push                commit and push to origin
`,
  )
  process.exit(0)
}

const mode = (args._[0] || (args["no-bump"] ? "none" : "patch")).toLowerCase()
const DRY_RUN = Boolean(args["dry-run"])

if (
  !["patch", "minor", "major", "none"].includes(mode) &&
  !/^\d+\.\d+(\.\d+)?$/.test(mode) &&
  !/^\d+$/.test(mode)
) {
  console.error(
    `\n✗ Unknown bump mode "${mode}"\n  Use patch | minor | major | none | X.Y.Z | <versionCode>.\n`,
  )
  process.exit(1)
}

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

function run(label, cmd, opts = {}) {
  console.log(`\n⏳ ${label}\n   ${cmd}`)
  execSync(cmd, { cwd: opts.cwd ?? root, stdio: "inherit" })
}

function hasCommand(cmd) {
  try {
    execFileSync(cmd, ["-version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const versionJson = readJson(versionPath)

// Fingerprints from Play Console → Setup → App signing (see scripts/play-signing.json).
function readSigningInfo() {
  const path = resolve(root, "scripts/play-signing.json")
  if (!existsSync(path)) return undefined
  try {
    return readJson(path)
  } catch {
    return undefined
  }
}

// ── preflight (before anything is bumped or built) ──────────────────────
console.log("Preflight")
const problems = []
const notes = []

if (!existsSync(gradlew)) problems.push(`missing gradle wrapper: ${gradlew}`)
if (!hasCommand("java")) problems.push("java not found on PATH (Android Studio ships one — set JAVA_HOME or use its terminal)")

const uploading = !args["build-only"]
// A signed bundle is needed whenever gradle runs — build-only included.
const needsSigning = !args["no-gradle"]
if (existsSync(keystoreProperties)) {
  const signing = readFileSync(keystoreProperties, "utf8")
  const read = (key) =>
    signing
      .match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "m"))?.[1]
      ?.trim()
      .replace(/\\\\/g, "\\")
  const storeFile = read("storeFile")
  const resolvedStore = storeFile && resolve(androidDir, "app", storeFile)
  if (resolvedStore && !existsSync(resolvedStore)) {
    problems.push(
      `android/keystore.properties points at ${storeFile} which does not exist`,
    )
  } else if (resolvedStore) {
    // Prove the keystore actually opens with these values, so a typo fails
    // here instead of inside gradle. Password goes through the environment,
    // never argv.
    const keyAlias = read("keyAlias")
    const storePassword = read("storePassword")
    try {
      const report = execFileSync(
        findKeytool(),
        [
          "-list",
          "-v",
          "-keystore",
          resolvedStore,
          "-storepass:env",
          "AGSKAN_PREFLIGHT_PASS",
          ...(keyAlias ? ["-alias", keyAlias] : []),
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, AGSKAN_PREFLIGHT_PASS: storePassword ?? "" },
        },
      )

      // Guard against signing with the wrong key in a multi-key keystore:
      // Play only accepts the certificate registered as the upload key.
      const expected = readSigningInfo()?.uploadSha256
      const actual = report.match(/SHA256:\s*([0-9A-Fa-f:]+)/)?.[1]
      const normalize = (value) => value.replace(/[^0-9a-f]/gi, "").toUpperCase()
      if (expected && actual && normalize(actual) !== normalize(expected)) {
        problems.push(
          [
            `android/keystore.properties signs with alias "${keyAlias}", whose certificate`,
            `is not Play's upload key.`,
            `  Play expects  ${expected}`,
            `  this key is   ${actual}`,
            `Run \`npm run app:setup-key -- --force${readSigningInfo()?.uploadAlias ? ` --alias ${readSigningInfo().uploadAlias}` : ""}\` to switch to the right key.`,
          ].join("\n"),
        )
      } else {
        console.log(
          `  ✓ release keystore unlocked${keyAlias ? ` (alias ${keyAlias})` : " — no keyAlias set"}` +
            (expected ? " — matches Play's upload certificate" : ""),
        )
      }
    } catch (error) {
      const detail =
        `${error.stderr ?? ""}${error.stdout ?? ""}`
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)[0] ?? String(error.message).split("\n")[0]
      problems.push(
        [
          `android/keystore.properties does not unlock ${storeFile}` +
            (keyAlias ? ` with alias "${keyAlias}"` : "") +
            ".",
          `  ${detail}`,
          "Run `npm run app:setup-key -- --force` to rewrite it with the right password/alias.",
        ].join("\n"),
      )
    }
  }
} else if (needsSigning) {
  const alias = readSigningInfo()?.uploadAlias
  problems.push(
    [
      "android/keystore.properties is missing, so bundleRelease would be UNSIGNED",
      "and Play would reject the upload. Create it with:",
      `  npm run app:setup-key${alias ? ` -- --alias ${alias}` : ""}`,
      "(prompts for the password and verifies the key against Play — see",
      " docs/play-release.md)",
    ].join("\n"),
  )
}

if (uploading) {
  try {
    const { creds, path } = findCredentials(args.credentials)
    console.log(`  ✓ Play credentials: ${creds.client_email} (${path})`)
  } catch (error) {
    problems.push(error.message)
  }
}
if (existsSync(resolve(root, ".git/MERGE_HEAD"))) notes.push("a merge is in progress")
try {
  const behind = execSync("git rev-list --count HEAD..@{u}", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
  if (Number(behind) > 0) {
    notes.push(`${behind} commit(s) behind the remote — run git pull first`)
  }
} catch {
  // no upstream configured — nothing to compare against
}

if (notes.length) notes.forEach((note) => console.log(`  ! ${note}`))

if (problems.length) {
  fail(`Cannot continue:\n\n${problems.map((p) => `• ${p}`).join("\n\n")}`)
}

// ── plan ────────────────────────────────────────────────────────────────
const track = args.track ?? "production"
const status = args.status ?? "completed"
const fraction = args.fraction === undefined ? undefined : Number(args.fraction)
const releaseNotes = args["notes-file"]
  ? readFileSync(resolve(args["notes-file"]), "utf8").trim()
  : (args.notes ?? `Version ${versionJson.versionName} (${versionJson.versionCode})`)

console.log(
  [
    "",
    `Plan${DRY_RUN ? " (dry run)" : ""}:`,
    `  version   ${versionJson.versionName} (${versionJson.versionCode})` +
      (mode === "none" ? "  [no bump]" : `  [bump: ${mode}]`),
    `  web+bump  ${args["no-bump"] || mode === "none" ? "skip bump" : `node scripts/app-release.mjs ${mode}`}` +
      (args["no-web-build"] ? " (no web build)" : ""),
    `  bundle    ${args["no-gradle"] ? "skipped (--no-gradle)" : "gradlew bundleRelease"}`,
    `  upload    ${args["build-only"] ? "skipped (--build-only)" : `${track} / ${fraction != null ? `${Math.round(fraction * 100)}% staged` : status}`}`,
  ].join("\n"),
)

if (DRY_RUN) {
  console.log("\nDry run — nothing was written, built or uploaded.\n")
  process.exit(0)
}

// ── release: bump → build → bundle → upload → commit ────────────────────
async function release() {
  // 1. bump + web build + cap sync
  const shouldBump = !args["no-bump"] && mode !== "none"
  if (shouldBump) {
    const flags = args["no-web-build"] ? " --no-build" : ""
    run("Bump version + build web app", `node scripts/app-release.mjs ${mode}${flags}`)
  } else if (!args["no-web-build"]) {
    run("Rebuild web app (no bump) + cap sync", "node scripts/app-release.mjs none")
  }

  const version = JSON.parse(readFileSync(versionPath, "utf8"))
  console.log(`\n📦 Releasing ${version.versionName} (${version.versionCode})`)

  // 2. signed AAB
  if (!args["no-gradle"]) {
    run("Bundle release AAB", `"${gradlew}" bundleRelease`, { cwd: androidDir })

    if (!existsSync(DEFAULT_AAB)) {
      throw new Error(`gradle finished but ${DEFAULT_AAB} was not produced.`)
    }
    const bundle = readFileSync(DEFAULT_AAB)
    // Verify the certificate that actually signed the bundle, not just that
    // some signature exists: Play only accepts its registered upload key.
    const signerSha256 = printJarSignerSha256(DEFAULT_AAB)
    const expected = readSigningInfo()?.uploadSha256
    if (!signerSha256) {
      throw new Error(
        `The bundle at ${DEFAULT_AAB} is not signed, so Play would reject it.\n` +
          "Check android/keystore.properties (npm run app:setup-key) and rebuild.",
      )
    }
    if (expected && normalizeFingerprint(signerSha256) !== normalizeFingerprint(expected)) {
      throw new Error(
        [
          `The bundle is signed with ${signerSha256},`,
          `but Play's upload certificate is ${expected}.`,
          "Run `npm run app:setup-key -- --force` and rebuild.",
        ].join("\n"),
      )
    }
    console.log(
      `  ${expected ? "✓" : "!"} ${DEFAULT_AAB} ` +
        `(${(bundle.length / 1024 / 1024).toFixed(1)} MB, signed by ${signerSha256}` +
        `${expected ? " — matches Play's upload certificate)" : ")"}`,
    )
  }

  // 3. upload + rollout
  const packageName =
    args.package ??
    readFileSync(resolve(root, "capacitor.config.ts"), "utf8").match(
      /appId:\s*'([^']+)'/,
    )?.[1]

  if (!args["build-only"]) {
    if (!packageName) {
      throw new Error("Could not read appId from capacitor.config.ts — pass --package.")
    }
    await publishBundle({
      aabPath: args.aab ? resolve(args.aab) : DEFAULT_AAB,
      packageName,
      track,
      status,
      userFraction: fraction,
      versionName: version.versionName,
      expectedVersionCode: version.versionCode,
      releaseNotes,
      notesLanguage: args["notes-lang"] ?? "en-US",
      validate: Boolean(args.validate),
      skipSignCheck: Boolean(args["no-sign-check"]),
      credentials: args.credentials,
    })

    const current = await readTrack({
      packageName,
      track,
      credentials: args.credentials,
    })
    console.log(`\n${current.track} track now has:`)
    for (const item of current.releases ?? []) {
      console.log(
        `  ${item.name ?? "(unnamed)"}  [${item.status}]  ` +
          `codes ${item.versionCodes?.join(", ") ?? "-"}` +
          (item.userFraction != null
            ? `  ${Math.round(item.userFraction * 100)}%`
            : ""),
      )
    }
  }

  // 4. keep the repo in step with what was released
  if (args["build-only"]) {
    console.log(`\nAAB ready: ${DEFAULT_AAB}\nNothing was uploaded (--build-only).\n`)
  } else if (args.commit || args.push) {
    const staged = versionFiles.filter((file) => existsSync(resolve(root, file)))
    run(
      "Commit version files",
      `git add -- ${staged.join(" ")} && git commit -m "Release app ${version.versionName} (${version.versionCode})"`,
    )
    if (args.push) run("Push", "git push")
  } else {
    console.log(
      `\nNext: commit the version files so the website shows the same version:\n` +
        `  git add version.json capacitor.config.ts android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj\n` +
        `  git commit -m "Release app ${version.versionName} (${version.versionCode})" && git push\n`,
    )
  }
}

try {
  await release()
} catch (error) {
  // process.exitCode (not process.exit): closing the process while an upload
  // socket is open aborts libuv on Windows.
  console.error(`\n✗ ${explainPlayError(error.message)}\n`)
  process.exitCode = 1
}
