// Shared helper for locating JDK command-line tools, so the release scripts
// work whether or not JAVA_HOME / PATH is configured.

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

/** Absolute path to keytool, or "keytool" when it has to come from PATH. */
export function findKeytool() {
  const exe = process.platform === "win32" ? "keytool.exe" : "keytool"
  const candidates = []
  if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, "bin", exe))

  // java prints -XshowSettings:properties to stderr.
  const probe = spawnSync("java", ["-XshowSettings:properties", "-version"], {
    encoding: "utf8",
  })
  const home = `${probe.stdout ?? ""}${probe.stderr ?? ""}`
    .match(/java\.home = (.+)/)?.[1]
    ?.trim()
  if (home) candidates.push(join(home, "bin", exe))

  return candidates.find((candidate) => existsSync(candidate)) ?? exe
}

/**
 * SHA-256 of the certificate that signed a jar/AAB, or null when it is not
 * signed. Uses `keytool -printcert -jarfile`, which reads the jar signature
 * block directly.
 */
export function printJarSignerSha256(jarPath) {
  const result = spawnSync(
    findKeytool(),
    ["-printcert", "-jarfile", jarPath],
    { encoding: "utf8" },
  )
  if (result.status !== 0) return null
  return `${result.stdout ?? ""}`
    .match(/SHA256:\s*([0-9A-Fa-f:]+)/)?.[1]
    ?.trim()
}

/** Normalise a fingerprint for comparison (case/separators do not matter). */
export function normalizeFingerprint(value) {
  return String(value ?? "")
    .replace(/[^0-9a-f]/gi, "")
    .toUpperCase()
}
