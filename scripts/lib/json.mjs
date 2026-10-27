// JSON reader that tolerates a UTF-8 BOM — PowerShell's Set-Content -Encoding
// utf8 adds one, which JSON.parse rejects.

import { readFileSync } from "node:fs"

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""))
}
