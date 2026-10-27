#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// setup-upload-key.mjs — write android/keystore.properties safely
//
//   npm run app:setup-key                       # prompts for the password
//   npm run app:setup-key -- --alias key0       # pick the alias up front
//   npm run app:setup-key -- --store C:/keys/upload.jks
//
// The password is read without echoing, passed to keytool through an
// environment variable (never argv), and verified before anything is written.
// The resulting file is git-ignored.
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Writable } from "node:stream"
import readline from "node:readline"

import { findKeytool } from "./lib/java-tools.mjs"
import { readJson } from "./lib/json.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const androidDir = resolve(root, "android")
const propertiesPath = resolve(androidDir, "keystore.properties")
const PASSWORD_ENV = "AGSKAN_KEYSTORE_PASSWORD"

const args = { _: [] }
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (!arg.startsWith("--")) {
    args._.push(arg)
    continue
  }
  const key = arg.slice(2)
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith("--")) {
    args[key] = true
  } else {
    args[key] = next
    i++
  }
}

const KNOWN_FLAGS = new Set([
  "store",
  "alias",
  "key-password",
  "force",
  "help",
  "h",
])

if (args.help || args.h) {
  console.log(`Usage: node scripts/setup-upload-key.mjs [options]

  --store <path>     keystore file (default android-keystore.jks)
  --alias <name>     key alias to sign with (prompted when the file has more than one)
  --key-password <p> key password when it differs from the store password
  --force            overwrite an existing android/keystore.properties
  -h, --help         this help

The store password is read from $${PASSWORD_ENV} when set (CI), otherwise it
is prompted for without echoing.`)
  process.exit(0)
}

for (const key of Object.keys(args)) {
  if (key === "_" || KNOWN_FLAGS.has(key)) continue
  const suggestion = [...KNOWN_FLAGS].find(
    (candidate) => candidate.startsWith(key) || key.startsWith(candidate),
  )
  console.error(
    [
      "",
      `✗ Unknown option --${key}`,
      suggestion ? `  Did you mean --${suggestion}?` : "",
      "  Run with --help to see the supported options.",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  )
  process.exit(1)
}
if (args._.length > 0) {
  console.error(`\n✗ Unexpected arguments: ${args._.join(" ")}\n`)
  process.exit(1)
}

function promptHidden(question) {
  return new Promise((resolvePromise) => {
    process.stdout.write(question)
    const muted = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })
    const rl = readline.createInterface({
      input: process.stdin,
      output: muted,
      terminal: true,
    })
    rl.question("", (answer) => {
      rl.close()
      process.stdout.write("\n")
      resolvePromise(answer)
    })
  })
}

function promptVisible(question) {
  return new Promise((resolvePromise) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question(question, (answer) => {
      rl.close()
      resolvePromise(answer.trim())
    })
  })
}

function fail(message) {
  // No network I/O in this script, so exiting here is safe.
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

const storeArg = args.store ?? "android-keystore.jks"
const storePath = isAbsolute(storeArg) ? storeArg : resolve(root, storeArg)

if (!existsSync(storePath)) fail(`Keystore not found: ${storePath}`)
if (existsSync(propertiesPath) && !args.force) {
  fail(
    `${propertiesPath} already exists. Re-run with --force to overwrite it.`,
  )
}

const keytool = findKeytool()
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
if (args.alias === undefined && !interactive && !process.env[PASSWORD_ENV]) {
  fail(
    "Non-interactive run: set $AGSKAN_KEYSTORE_PASSWORD (and --alias when the keystore has several keys).",
  )
}
const password =
  process.env[PASSWORD_ENV] ??
  (interactive
    ? await promptHidden(`Keystore password for ${storePath}: `)
    : undefined)

if (!password) {
  fail(
    `No password given. Set $${PASSWORD_ENV} for non-interactive runs.`,
  )
}

function keytoolList(extraArgs = []) {
  // -storepass:env keeps the password out of the process list.
  return execFileSync(
    keytool,
    ["-list", "-v", "-keystore", storePath, `-storepass:env`, PASSWORD_ENV, ...extraArgs],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, [PASSWORD_ENV]: password },
    },
  )
}

let listing
try {
  listing = keytoolList()
} catch (error) {
  const detail = String(error.stderr ?? error.message).trim().split("\n")[0]
  fail(
    `keytool could not open the keystore — wrong password or unreadable file.\n${detail}`,
  )
  process.exit(1)
}

const aliases = [...listing.matchAll(/^Alias name:\s*(.+?)\s*$/gm)].map(
  (match) => match[1],
)

if (aliases.length === 0) fail("No key aliases found in the keystore.")

// Map every alias to its certificate fingerprints, so the one matching Play's
// upload certificate can be picked automatically.
const normalize = (value) => value.replace(/[^0-9a-f]/gi, "").toUpperCase()
const fingerprints = new Map()
for (const block of listing.split(/^Alias name:\s*/m).slice(1)) {
  const name = block.match(/^(.+?)\s*$/m)?.[1]?.trim()
  if (!name) continue
  fingerprints.set(name, {
    sha256: block.match(/SHA256:\s*([0-9A-Fa-f:]+)/)?.[1],
    sha1: block.match(/\bSHA1:\s*([0-9A-Fa-f:]+)/)?.[1],
  })
}

const signingInfoPath = resolve(root, "scripts/play-signing.json")
let expectedUpload
try {
  expectedUpload = existsSync(signingInfoPath)
    ? readJson(signingInfoPath).uploadSha256
    : undefined
} catch {
  console.warn(`⚠ Could not read ${signingInfoPath} — skipping the Play fingerprint check.`)
}
const matchingAlias = expectedUpload
  ? aliases.find((name) =>
      normalize(fingerprints.get(name)?.sha256 ?? "") ===
      normalize(expectedUpload),
    )
  : undefined

let alias = args.alias
if (alias && !aliases.includes(alias)) {
  fail(
    `Alias "${alias}" is not in the keystore. Available: ${aliases.join(", ")}`,
  )
}
if (!alias) {
  if (matchingAlias) {
    alias = matchingAlias
    console.log(`✓ ${alias} matches Play's upload certificate.`)
  } else if (aliases.length === 1) {
    alias = aliases[0]
  } else {
    console.log(`The keystore has ${aliases.length} keys:`)
    aliases.forEach((name, index) => {
      const sha = fingerprints.get(name)?.sha256 ?? "unknown"
      console.log(`  ${index + 1}. ${name}  (SHA256 ${sha})`)
    })
    if (expectedUpload) {
      console.log(
        `None matches Play's upload certificate (${expectedUpload}).`,
      )
    }
    if (!interactive) {
      fail(
        "Non-interactive run: pass --alias <name> to choose the signing key.",
      )
    }
    const answer = await promptVisible(`Which alias should sign releases? [1-${aliases.length}]: `)
    const index = Number(answer) - 1
    if (!Number.isInteger(index) || !aliases[index]) {
      fail(`Expected a number between 1 and ${aliases.length}.`)
      process.exit(1)
    }
    alias = aliases[index]
  }
}

if (
  expectedUpload &&
  normalize(fingerprints.get(alias)?.sha256 ?? "") !== normalize(expectedUpload)
) {
  console.warn(
    [
      `⚠ ${alias} is NOT Play's upload certificate.`,
      `  Play expects ${expectedUpload}`,
      `  ${alias} is     ${fingerprints.get(alias)?.sha256 ?? "unknown"}`,
      matchingAlias
        ? `  Use the alias that matches: ${matchingAlias}`
        : "  None of the keys in this keystore match — this is the wrong keystore.",
      expectedUpload && matchingAlias
        ? `  Fix: npm run app:setup-key -- --force --alias ${matchingAlias}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  )
}

// storeFile is resolved from android/app by android/app/build.gradle. Inside
// the repo use a relative path; a keystore elsewhere gets an absolute one so
// the file keeps working regardless of the working directory.
const relativeStore = relative(resolve(androidDir, "app"), storePath)
const insideRepo = !relative(root, storePath).startsWith("..")
const storeValue = (insideRepo ? relativeStore : storePath)
  .split("\\")
  .join("/")

const keyPassword = args["key-password"] ?? password
const escape = (value) => value.replace(/\\/g, "\\\\")

const contents = [
  "# Generated by scripts/setup-upload-key.mjs - git-ignored, do not commit.",
  `storeFile=${escape(storeValue)}`,
  `storePassword=${escape(password)}`,
  `keyAlias=${alias}`,
  `keyPassword=${escape(keyPassword)}`,
  "",
].join("\n")

writeFileSync(propertiesPath, contents)

const details = keytoolList(["-alias", alias, "-v"])
const sha256 = details.match(/SHA256:\s*([0-9A-F:]+)/)?.[1]
const sha1 = details.match(/\bSHA1:\s*([0-9A-F:]+)/)?.[1]

console.log(`✓ Wrote ${propertiesPath}`)
console.log(`  storeFile  ${storeValue}`)
console.log(`  keyAlias   ${alias}`)
if (sha1) console.log(`  SHA1       ${sha1}`)
if (sha256) console.log(`  SHA256     ${sha256}`)
console.log(
  [
    "",
    "Next:",
    "  1. Compare the SHA256 above with Play Console → Setup → App signing →",
    "     upload certificate. If they differ, re-run with the other alias:",
    `        npm run app:setup-key -- --force --alias <other alias>`,
    "  2. npm run app:publish -- --build-only     (should print \"signed\")",
    "  3. npm run app:publish:check               (proves Play API access)",
    "",
  ].join("\n"),
)
