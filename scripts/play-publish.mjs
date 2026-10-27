#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// play-publish.mjs — upload an Android App Bundle to Google Play
//
//   node scripts/play-publish.mjs                       (upload the last AAB)
//   node scripts/play-publish.mjs --track beta
//   node scripts/play-publish.mjs --status draft
//   node scripts/play-publish.mjs --fraction 0.1        (staged rollout)
//   node scripts/play-publish.mjs --notes "Bug fixes"
//
// Auth: a Google Play service account JSON (Play Console → Setup → API access).
// Lookup order for the credentials file:
//   --credentials <path>  →  PLAY_SERVICE_ACCOUNT_JSON  →
//   GOOGLE_APPLICATION_CREDENTIALS  →  android/play-service-account.json
//
// Zero dependencies: the service-account JWT is signed with node:crypto and
// the bundle is uploaded with fetch (Node 18+). Play Developer API v3 flow:
//   edits.insert → bundles.upload → tracks.patch → edits.commit
// On any failure the open edit is discarded, so the next run is not blocked
// by a leftover edit.
//
// One-time setup is documented in docs/play-release.md.
// ─────────────────────────────────────────────────────────────────────────

import { createSign } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { findKeytool, normalizeFingerprint, printJarSignerSha256 } from "./lib/java-tools.mjs"
import { readJson } from "./lib/json.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3"
// Media uploads live under a different prefix: without /upload the bundle is
// parsed as a JSON body and rejected with "Invalid JSON payload".
const UPLOAD_API = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3"
const SCOPE = "https://www.googleapis.com/auth/androidpublisher"

export const DEFAULT_AAB = resolve(
  root,
  "android/app/build/outputs/bundle/release/app-release.aab",
)

const CREDENTIAL_HINTS = [
  "--credentials <path>",
  "$PLAY_SERVICE_ACCOUNT_JSON",
  "$GOOGLE_APPLICATION_CREDENTIALS",
  "android/play-service-account.json",
]

/** Play's signing fingerprints, when the repo records them. */
function readPlaySigningInfo() {
  const path = resolve(root, "scripts/play-signing.json")
  if (!existsSync(path)) return undefined
  try {
    return readJson(path)
  } catch {
    return undefined
  }
}

/** Play's raw error JSON is unhelpful; map the common ones to an action. */
export function explainPlayError(message) {
  const hints = []
  if (/invalid_grant/i.test(message)) {
    hints.push(
      "The key is wrong, revoked, or belongs to a different service account than the one invited in Play Console.",
    )
  }
  if (/has not been used in project|SERVICE_DISABLED|it is disabled/i.test(message)) {
    hints.push(
      "Enable the API in the Cloud project: https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/",
    )
  }
  if (/has not been linked in the Google Play Developer Console/i.test(message)) {
    hints.push(
      "Link the Cloud project: Play Console → Setup → API access → Link a Google Cloud project.",
    )
  }
  if (/does not own the application|caller does not have permission|insufficient permissions for this request/i.test(message)) {
    hints.push(
      "Give the service account access to this app: Play Console → Users and permissions → the service-account row → App permissions → tick 'Release to production, exclude devices, and use Play App Signing'.",
    )
  }
  if (/minimum SDK version/i.test(message)) {
    hints.push(
      "Raise minSdkVersion (Play's automatic protection requires 24+) in android/variables.gradle, then rebuild and re-upload. The rejected versionCode was not consumed.",
    )
  }
  if (!hints.length) return message
  return `${message}\n\nWhat to do:\n${hints.map((hint) => `  - ${hint}`).join("\n")}`
}

/** Locate the service-account JSON, or explain how to provide it. */
export function findCredentials(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.PLAY_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    resolve(root, "android/play-service-account.json"),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const path = isAbsolute(candidate) ? candidate : resolve(root, candidate)
    if (existsSync(path)) {
      const creds = JSON.parse(readFileSync(path, "utf8"))
      if (!creds.client_email || !creds.private_key) {
        throw new Error(
          `${path} is not a service-account key (client_email/private_key missing).`,
        )
      }
      return { path, creds }
    }
  }

  throw new Error(
    [
      "No Google Play service-account key found. Looked for:",
      ...CREDENTIAL_HINTS.map((hint) => `  - ${hint}`),
      "",
      "See docs/play-release.md → 'One-time setup' to create it.",
    ].join("\n"),
  )
}

function b64url(value) {
  return Buffer.from(value).toString("base64url")
}

/** Mint a short-lived OAuth token from the service-account private key. */
async function getAccessToken(creds, label) {
  const tokenUri = creds.token_uri || "https://oauth2.googleapis.com/token"
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  if (creds.private_key_id) header.kid = creds.private_key_id
  const claims = {
    iss: creds.client_email,
    scope: SCOPE,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(creds.private_key.replace(/\\n/g, "\n"))

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${b64url(signature)}`,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Google token exchange failed (${res.status}) using ${label}.\n${text}`,
    )
  }
  return JSON.parse(text).access_token
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    const error = new Error(
      `Play Developer API ${method} ${path} failed (${res.status}).\n${text}`,
    )
    error.status = res.status
    throw error
  }
  return text ? JSON.parse(text) : {}
}

async function openEdit(token, packageName) {
  try {
    return await api(token, "POST", `/applications/${packageName}/edits`, {})
  } catch (error) {
    if (error.status === 409) {
      throw new Error(
        [
          "Play already has an open edit for this app, so a new release cannot be created.",
          "Finish or discard it in Play Console → Publishing overview, or wait for it to expire",
          "(an edit expires about an hour after it was opened). Then re-run this command.",
        ].join("\n"),
      )
    }
    throw error
  }
}

async function discardEdit(token, packageName, editId) {
  try {
    await api(token, "DELETE", `/applications/${packageName}/edits/${editId}`)
    return true
  } catch {
    return false
  }
}

/**
 * Upload an AAB, attach it to a track, and commit the edit.
 * Returns { editId, versionCode, release, warnings }.
 */
export async function publishBundle({
  aabPath = DEFAULT_AAB,
  packageName,
  track = "production",
  status = "completed",
  userFraction,
  versionName,
  expectedVersionCode,
  releaseNotes,
  notesLanguage = "en-US",
  validate = false,
  skipSignCheck = false,
  credentials,
  log = console.log,
}) {
  if (!existsSync(aabPath)) {
    throw new Error(
      `No App Bundle at ${aabPath}. Build it first:\n  cd android\n  ${process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew"} bundleRelease`,
    )
  }

  const bundle = readFileSync(aabPath)
  log(`📦 Bundle: ${aabPath} (${(bundle.length / 1024 / 1024).toFixed(1)} MB)`)

  // A jar-signed AAB carries a META-INF signature block; Play rejects
  // unsigned bundles, so catch that locally instead of after a 50 MB upload.
  // When scripts/play-signing.json is present the signing certificate is also
  // compared with Play's upload key.
  if (!skipSignCheck) {
    const signer = printJarSignerSha256(aabPath)
    if (!signer) {
      throw new Error(
        [
          "This AAB has no signature, so Play will reject it.",
          "Set up android/keystore.properties (see docs/play-release.md) and rebuild,",
          "or pass --no-sign-check if you know the bundle is signed.",
        ].join("\n"),
      )
    }
    const expected = readPlaySigningInfo()?.uploadSha256
    if (expected && normalizeFingerprint(signer) !== normalizeFingerprint(expected)) {
      throw new Error(
        [
          `This AAB is signed with ${signer},`,
          `but Play's upload certificate is ${expected}.`,
          "Rebuild with the right key (npm run app:setup-key -- --force).",
        ].join("\n"),
      )
    }
    log(
      `🔏 Signed by ${signer}` +
        (expected ? " — matches Play's upload certificate" : ""),
    )
  }

  const { creds, path: credsPath } = findCredentials(credentials)
  log(`🔑 Service account: ${creds.client_email} (${credsPath})`)
  const token = await getAccessToken(creds, credsPath)

  const edit = await openEdit(token, packageName)
  log(`✎ Edit ${edit.id}`)

  try {
    const uploadRes = await fetch(
      `${UPLOAD_API}/applications/${packageName}/edits/${edit.id}/bundles?uploadType=media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bundle.length),
        },
        body: bundle,
      },
    )
    const uploadText = await uploadRes.text()
    if (!uploadRes.ok) {
      throw new Error(
        `Bundle upload failed (${uploadRes.status}).\n${uploadText}`,
      )
    }
    const versionCode = JSON.parse(uploadText).versionCode
    log(`⬆ Uploaded versionCode ${versionCode}`)

    // The version inside the bundle is authoritative — if it does not match
    // version.json the build was stale, so abort before anything is released.
    if (
      expectedVersionCode !== undefined &&
      Number(expectedVersionCode) !== Number(versionCode)
    ) {
      throw new Error(
        `Bundle contains versionCode ${versionCode} but version.json says ${expectedVersionCode}.\n` +
          "The AAB is stale — rebuild it (npm run build:app:rebuild) and retry.",
      )
    }

    const release = {
      status,
      versionCodes: [String(versionCode)],
      ...(versionName ? { name: versionName } : {}),
    }
    if (userFraction !== undefined && userFraction !== null) {
      if (status === "completed") release.status = "inProgress"
      release.userFraction = userFraction
    }
    if (releaseNotes) {
      // Play caps release notes at 500 characters per language.
      release.releaseNotes = [
        { language: notesLanguage, text: releaseNotes.slice(0, 500) },
      ]
    }

    await api(
      token,
      "PATCH",
      `/applications/${packageName}/edits/${edit.id}/tracks/${track}`,
      { track, releases: [release] },
    )
    log(
      `🏷  Track "${track}" ← ${versionName ? `${versionName} / ` : ""}${versionCode}` +
        (release.userFraction != null
          ? ` (${Math.round(release.userFraction * 100)}% staged rollout)`
          : ` (${release.status})`),
    )

    const warnings = []
    if (validate) {
      const res = await api(
        token,
        "POST",
        `/applications/${packageName}/edits/${edit.id}:validate`,
      )
      for (const warning of res.warnings ?? []) {
        warnings.push(warning.message ?? String(warning))
      }
      warnings.forEach((w) => log(`⚠ ${w}`))
    }

    await api(
      token,
      "POST",
      `/applications/${packageName}/edits/${edit.id}:commit`,
    )
    log("✅ Edit committed — Play is processing the release now.")

    return { editId: edit.id, versionCode, release, warnings }
  } catch (error) {
    if (await discardEdit(token, packageName, edit.id)) {
      log(`↩ Discarded edit ${edit.id} (nothing was released).`)
    }
    throw error
  }
}

/**
 * Move an already-uploaded versionCode to a live release status without
 * re-uploading it (Play rejects a second bundle with the same versionCode).
 */
export async function promoteRelease({
  packageName,
  versionCode,
  track = "production",
  status = "completed",
  userFraction,
  releaseNotes,
  notesLanguage = "en-US",
  credentials,
  log = console.log,
}) {
  const { creds, path: credsPath } = findCredentials(credentials)
  const token = await getAccessToken(creds, credsPath)
  const edit = await openEdit(token, packageName)

  try {
    const { tracks = [] } = await api(
      token,
      "GET",
      `/applications/${packageName}/edits/${edit.id}/tracks`,
    )
    const target = (tracks.find((t) => t.track === track)?.releases ?? []).find(
      (release) =>
        (release.versionCodes ?? []).map(String).includes(String(versionCode)),
    )
    if (!target) {
      throw new Error(
        `versionCode ${versionCode} is not on the "${track}" track.\n` +
          "Upload it first (npm run app:publish:upload) or pick a versionCode from the track listing.",
      )
    }

    const release = { ...target, status }
    if (userFraction !== undefined && userFraction !== null) {
      if (status === "completed") release.status = "inProgress"
      release.userFraction = userFraction
    } else {
      delete release.userFraction
    }
    if (releaseNotes) {
      release.releaseNotes = [
        { language: notesLanguage, text: releaseNotes.slice(0, 500) },
      ]
    }

    await api(
      token,
      "PATCH",
      `/applications/${packageName}/edits/${edit.id}/tracks/${track}`,
      { track, releases: [release] },
    )
    await api(
      token,
      "POST",
      `/applications/${packageName}/edits/${edit.id}:commit`,
    )
    log(
      `✅ ${track} ← ${release.name ?? versionCode} / ${versionCode} is now ` +
        `${release.status}${release.userFraction != null ? ` (${Math.round(release.userFraction * 100)}%)` : ""} — no re-upload needed.`,
    )
    return release
  } catch (error) {
    if (await discardEdit(token, packageName, edit.id)) {
      log(`↩ Discarded edit ${edit.id} (nothing changed).`)
    }
    throw error
  }
}

/** List every track (opens and discards a throwaway edit). Read-only. */
export async function listTracks({ packageName, credentials }) {
  const { creds, path: credsPath } = findCredentials(credentials)
  const token = await getAccessToken(creds, credsPath)
  const edit = await openEdit(token, packageName)
  try {
    const { tracks = [] } = await api(
      token,
      "GET",
      `/applications/${packageName}/edits/${edit.id}/tracks`,
    )
    return tracks
  } finally {
    await discardEdit(token, packageName, edit.id)
  }
}

/** Read the current releases on one track. Read-only. */
export async function readTrack({
  packageName,
  track = "production",
  credentials,
}) {
  const tracks = await listTracks({ packageName, credentials })
  return tracks.find((t) => t.track === track) ?? { track, releases: [] }
}

// ── CLI ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) {
      args._.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) {
      args[key] = true
    } else {
      args[key] = next
      i++
    }
  }
  return args
}

const KNOWN_FLAGS = new Set([
  "aab",
  "package",
  "track",
  "status",
  "fraction",
  "notes",
  "notes-file",
  "notes-lang",
  "credentials",
  "validate",
  "no-sign-check",
  "check",
  "promote",
  "dry-run",
  "help",
  "h",
])

const HELP = `Usage: node scripts/play-publish.mjs [options]

  --aab <path>          App Bundle to upload (default ${DEFAULT_AAB})
  --package <id>        applicationId (default from capacitor.config.ts)
  --track <name>        production (default) | beta | alpha | internal
  --status <status>     completed (default, full rollout) | draft | halted
  --fraction <0-1>      staged rollout, e.g. 0.1 for 10%
  --notes "<text>"      release notes for the track
  --notes-file <path>   read release notes from a file
  --notes-lang <bcp47>  release notes language (default en-US)
  --credentials <path>  service-account JSON
  --validate            ask Play to validate the edit before committing
  --no-sign-check       skip the "does this AAB look signed" heuristic
  --check               read-only: authenticate and list the tracks (setup check)
  --promote <code>      push an already-uploaded versionCode live (no re-upload)
  --dry-run             check bundle + credentials, do not touch Play
  -h, --help            this help
`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) {
    console.log(HELP)
    return
  }

  for (const key of Object.keys(args)) {
    if (key === "_" || KNOWN_FLAGS.has(key)) continue
    const suggestion = [...KNOWN_FLAGS].find(
      (candidate) => candidate.startsWith(key) || key.startsWith(candidate),
    )
    throw new Error(
      `Unknown option --${key}${suggestion ? ` — did you mean --${suggestion}?` : ""}\nRun with --help to see the supported options.`,
    )
  }
  if (args._.length > 0) {
    throw new Error(
      `Unexpected arguments: ${args._.join(" ")}\nThis command takes options only (see --help).`,
    )
  }

  const capConfig = readFileSync(resolve(root, "capacitor.config.ts"), "utf8")
  const packageName =
    args.package ?? capConfig.match(/appId:\s*'([^']+)'/)?.[1] ?? "com.skanfarming"
  const versionJson = readJson(resolve(root, "version.json"))
  const aabPath = args.aab ? resolve(args.aab) : DEFAULT_AAB
  const releaseNotes = args["notes-file"]
    ? readFileSync(resolve(args["notes-file"]), "utf8").trim()
    : args.notes

  if (args.check) {
    // Read-only setup check: mint a token, open an edit, list the tracks,
    // discard the edit. Proves the service account can reach THIS app.
    console.log(`🔎 Checking Play access for ${packageName}`)
    const { creds, path } = findCredentials(args.credentials)
    console.log(`🔑 Service account: ${creds.client_email} (${path})`)
    const tracks = await listTracks({ packageName, credentials: args.credentials })
    if (tracks.length === 0) {
      console.log(
        "No tracks returned — check that the service account has app access in\n" +
          "Play Console → Users and permissions, and that the Google Play Android\n" +
          "Developer API is enabled in the linked Cloud project.",
      )
      process.exitCode = 1
      return
    }
    for (const item of tracks) {
      console.log(`\n${item.track}`)
      const releases = item.releases ?? []
      if (releases.length === 0) {
        console.log("  (no releases)")
        continue
      }
      for (const release of releases) {
        console.log(
          `  ${release.name ?? "(unnamed)"}  [${release.status}]  ` +
            `codes ${release.versionCodes?.join(", ") ?? "-"}` +
            (release.userFraction != null
              ? `  ${Math.round(release.userFraction * 100)}%`
              : ""),
        )
      }
    }
    console.log("\n✓ Service account can read this app's tracks.\n")
    return
  }

  if (args.promote) {
    if (args.promote === true) {
      throw new Error(
        "--promote needs a versionCode, e.g. `npm run app:publish:promote -- 297`.",
      )
    }
    const versionCode = Number(args.promote)
    if (!Number.isInteger(versionCode) || versionCode <= 0) {
      throw new Error(`--promote needs a numeric versionCode, got "${args.promote}".`)
    }
    if (args["dry-run"]) {
      const trackLabel = args.track ?? "production"
      const statusLabel =
        args.fraction === undefined
          ? (args.status ?? "completed")
          : `inProgress at ${Math.round(Number(args.fraction) * 100)}%`
      console.log(
        `Dry run — would set versionCode ${versionCode} on ${trackLabel} to ${statusLabel}.`,
      )
      return
    }
    await promoteRelease({
      packageName,
      versionCode,
      track: args.track ?? "production",
      status: args.status ?? "completed",
      userFraction:
        args.fraction === undefined ? undefined : Number(args.fraction),
      releaseNotes,
      notesLanguage: args["notes-lang"] ?? "en-US",
      credentials: args.credentials,
    })
    return
  }

  if (args["dry-run"]) {
    const { creds, path } = findCredentials(args.credentials)
    console.log(
      [
        "Dry run — nothing was sent to Play.",
        `  package      ${packageName}`,
        `  bundle       ${aabPath} ${existsSync(aabPath) ? "✓" : "✗ MISSING"}`,
        `  version.json ${versionJson.versionName} (${versionJson.versionCode})`,
        `  track        ${args.track ?? "production"}`,
        `  credentials  ${creds.client_email} (${path})`,
      ].join("\n"),
    )
    if (!existsSync(aabPath)) process.exitCode = 1
    return
  }

  await publishBundle({
    aabPath,
    packageName,
    track: args.track ?? "production",
    status: args.status ?? "completed",
    userFraction:
      args.fraction === undefined ? undefined : Number(args.fraction),
    versionName: versionJson.versionName,
    expectedVersionCode: versionJson.versionCode,
    releaseNotes,
    notesLanguage: args["notes-lang"] ?? "en-US",
    validate: Boolean(args.validate),
    skipSignCheck: Boolean(args["no-sign-check"]),
    credentials: args.credentials,
  })

  const track = await readTrack({
    packageName,
    track: args.track ?? "production",
    credentials: args.credentials,
  })
  console.log(`\n${track.track} track now has:`)
  for (const release of track.releases ?? []) {
    console.log(
      `  ${release.name ?? "(unnamed)"}  [${release.status}]  ` +
        `codes ${release.versionCodes?.join(", ") ?? "-"}` +
        (release.userFraction != null
          ? `  ${Math.round(release.userFraction * 100)}%`
          : ""),
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Note: process.exitCode (not process.exit) — exiting while an upload socket
    // is still open aborts libuv on Windows ("Assertion failed ... UV_HANDLE_CLOSING").
    console.error(`\n✗ ${explainPlayError(error.message)}\n`)
    process.exitCode = 1
  })
}
