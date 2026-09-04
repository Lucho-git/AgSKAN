import { readFileSync, writeFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)
const BASE = env.PUBLIC_SUPABASE_URL
const KEY = env.PRIVATE_SUPABASE_SERVICE_ROLE
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// find the map/farm whose code is 3309
for (const [map, farm, label] of [
  ["b8c8eb54-f1ff-4038-bf1c-daf070a37bbb", "78fbe514-a451-4ffe-a4bd-62ddb299e535", "LAHARNA"],
  ["5dda0791-52df-4984-8bb8-b4b4bf66d9bb", "5adceb16-0430-4fdd-9212-e4fad6cf1b4b", "LAHARNA FARMS"],
]) {
  const r = await fetch(`${BASE}/rest/v1/farms?select=*&id=eq.${farm}`, { headers: H })
  const rows = await r.json()
  console.log(label, JSON.stringify(rows[0]).slice(0, 500))
}

// pull fields for the selected candidate (whichever has code 3309) - start with LAHARNA
const [map, farm] = ["b8c8eb54-f1ff-4038-bf1c-daf070a37bbb", "78fbe514-a451-4ffe-a4bd-62ddb299e535"]
const rr = await fetch(
  `${BASE}/rest/v1/fields?select=field_id,name,boundary&map_id=eq.${map}&farm_id=eq.${farm}&limit=1000`,
  { headers: H },
)
const rows = await rr.json()
console.log("fields fetched:", rows.length)
writeFileSync(
  "data/_fields_laharna.json",
  JSON.stringify(
    rows.map((f) => ({
      name: f.name,
      boundary: typeof f.boundary === "string" ? JSON.parse(f.boundary) : f.boundary,
    })),
  ),
)
console.log("saved data/_fields_laharna.json")
