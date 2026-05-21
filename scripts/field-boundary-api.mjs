import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PMTiles } from "pmtiles"

const __dirname = dirname(fileURLToPath(import.meta.url))
const scriptPath = join(__dirname, "query-ftw-candidates.py")
const port = Number(process.env.FTW_API_PORT || 8787)
const pmtilesUrl =
  "https://data.source.coop/ftw/global-data/predictions/vectors/alpha/global.pmtiles"
const ftwPmtiles = new PMTiles(pmtilesUrl)

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    ...corsHeaders(),
    "Content-Type": "application/json",
  })
  response.end(JSON.stringify(body))
}

function sendTile(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...corsHeaders(),
    "Content-Type": "application/x-protobuf",
    "Cache-Control": "public, max-age=86400",
    ...extraHeaders,
  })
  response.end(body)
}

function getPythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON
  if (process.platform === "win32" && existsSync("C:/Python310/python.exe")) {
    return "C:/Python310/python.exe"
  }
  return process.platform === "win32" ? "python" : "python3"
}

function parseBbox(value) {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value === "string") return value.split(",").map(Number)
  if (value && typeof value === "object") {
    return [value.xmin, value.ymin, value.xmax, value.ymax].map(Number)
  }
  return []
}

function normalizeRequest(input) {
  const bbox = parseBbox(input.bbox)
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    throw new Error("bbox is required as xmin,ymin,xmax,ymax")
  }
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    throw new Error("bbox min values must be less than max values")
  }

  return {
    bbox,
    year: Number(input.year || 2025),
    limit: Math.min(Math.max(Number(input.limit || 50), 1), 250),
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"))
        request.destroy()
      }
    })
    request.on("end", () => resolve(body))
    request.on("error", reject)
  })
}

function runFtwQuery({ bbox, year, limit }) {
  return new Promise((resolve, reject) => {
    const child = spawn(getPythonCommand(), [
      scriptPath,
      `--bbox=${bbox.join(",")}`,
      "--year",
      String(year),
      "--limit",
      String(limit),
    ])

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `FTW query exited with code ${code}`))
        return
      }

      try {
        resolve(JSON.parse(stdout))
      } catch (error) {
        reject(new Error(`Invalid FTW query JSON: ${error.message}`))
      }
    })
  })
}

async function handleCandidates(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const input = {}

  if (request.method === "GET") {
    input.bbox = url.searchParams.get("bbox")
    input.year = url.searchParams.get("year")
    input.limit = url.searchParams.get("limit")
  } else {
    const body = await readRequestBody(request)
    Object.assign(input, body ? JSON.parse(body) : {})
  }

  const normalized = normalizeRequest(input)
  const collection = await runFtwQuery(normalized)
  sendJson(response, 200, collection)
}

async function handleFtwTile(url, response) {
  const match = url.pathname.match(/^\/ftw-pmtiles\/(\d+)\/(\d+)\/(\d+)\.mvt$/)
  if (!match) return false

  const z = Number(match[1])
  const x = Number(match[2])
  const y = Number(match[3])
  if (
    ![z, x, y].every(Number.isInteger) ||
    z < 0 ||
    z > 15 ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  ) {
    sendJson(response, 400, { error: "Invalid tile coordinate" })
    return true
  }

  const tile = await ftwPmtiles.getZxy(z, x, y)
  if (!tile) {
    sendJson(response, 404, { error: "Tile not found" })
    return true
  }

  const tileData =
    tile.data instanceof ArrayBuffer ? new Uint8Array(tile.data) : tile.data

  sendTile(response, 200, Buffer.from(tileData), {
    "Cache-Control": tile.cacheControl || "public, max-age=86400",
    ...(tile.expires ? { Expires: tile.expires } : {}),
  })
  return true
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders())
    response.end()
    return
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`)
    if (url.pathname === "/health") {
      sendJson(response, 200, { ok: true })
      return
    }
    if (await handleFtwTile(url, response)) {
      return
    }
    if (url.pathname === "/field-boundary-candidates") {
      await handleCandidates(request, response)
      return
    }
    sendJson(response, 404, { error: "Not found" })
  } catch (error) {
    console.error(error)
    sendJson(response, 500, { error: error.message || String(error) })
  }
}).listen(port, () => {
  console.log(`FTW boundary API listening on http://127.0.0.1:${port}`)
})
