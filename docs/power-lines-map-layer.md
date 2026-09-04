# Power Lines map layer — plan (GA Electricity Infrastructure)

Date: 2026-09-04. Status: **design + preprocessing done; build blocked on
tippecanoe (not installed) + final scope choices**. Decisions so far: 150022
keep-all-lines; bundle the `.pmtiles` in `static/` (no Supabase); OSM poles
fetcher script ready.

## Recommendation (summary)

1. **Dataset**: Geoscience Australia eCat **150022** `Electricity_Transmission_Lines.geojson` — **keep EVERYTHING, including the small-voltage lines** (down to 11 kV). 150022 already contains 66 kV ×1217, 132 ×1007, 110 ×227, 275 ×199, 330 ×162, 500 ×45, 220 ×168 plus a handful of 11/22/33/44 kV. Do **not** restrict to ≥66 kV (that's the 151179 rule) and don't filter during tiling.
   - Caveat: GA is still *transmission-ish* — it is NOT a complete distribution map. For genuinely-all lines incl. street-level distribution, OSM `power=minor_line` is the only national source (separate fetch, see poles section).
2. **Format**: keep the source as **GeoJSON** (never gdb/kmz/xlsx for this), but deliver to the map as **vector tiles** — a `.pmtiles` archive (~1–3 MB).
3. **Hosting — serve from local app data, not Supabase (recommended)**: the cleaned+tiled archive is small, so ship `powerlines.pmtiles` in `static/data/gis/`. It loads with the app and needs **zero Supabase calls ever** — your base Mapbox tiles still come from the internet on first load regardless, but power lines become a bundled asset (precached by the existing service worker on web; bundled in the Capacitor app on mobile). Update cost is just an app/web release, and GA updates this data only 'as needed' (rare).
   - If we ever want update-without-release, the alternative is hosting the archive in Supabase Storage and **downloading it once on first map open then serving all later tile reads from cache** — i.e. exactly 'load all the files in at that time so nothing after needs another Supabase call'. That needs a small service-worker range-slice cache addition.
   - Serving: reuse the existing generic route `src/service-worker.ts` `/ftw-client-pmtiles/{z}/{x}/{y}.mvt?archive=<url>` — currently the archive regex requires an `https://…​.pmtiles` URL, so for a local bundled file we relax it to also accept a same-origin path like `/powerlines.pmtiles` (the PMTiles lib inside the SW range-fetches that static file; Vercel + static hosts honour Range).
4. **Do NOT clip to user fields** — national coverage is cheap with tiles. Show across the whole country with `minzoom` (~10) + a toolbox toggle, exactly like the KMZ/FTW overlays.

## Dataset facts (verified 2026-09-04)

**150022 (National Electricity Infrastructure, CC-BY 4.0, superseded by 151179)**
- `Electricity_Transmission_Lines.geojson` — **3062 LineStrings**, 16.7 MB
- `Electricity_Transmission_Substations.geojson` — 1805 Points (has `VOLTAGEKV`, `LOCALITY`)
- `Major_Power_Stations.geojson` — 569 Points (has `GENERATIONMW`, `PRIMARYFUELTYPE`)
- CRS `EPSG:7844` = GDA2020 **degrees** → same numbers as lon/lat for display; no reprojection needed (strip `crs`)
- Line attributes worth using: `NAME` ("Taree to Stroud"), `CLASS` (`Overhead` 2851 / `Underground` 187 / `Overhead/Underground` 24), `OPERATIONALSTATUS` (mostly `Operational`), `CAPACITYKV` (11–500 kV; big buckets: 66 kV ×1217, 132 kV ×1007, 110 kV ×227, 275 kV ×199, 330 kV ×162, 500 kV ×45, 220 kV ×168), `STATE`
- **No poles/posts/towers in this dataset.** Lines + substations + power stations only.

**151179 (Electricity Infrastructure, June 2026, CC-BY 4.0)**
- Current version. Power Lines restricted to **≥66 kV**; Vic + Tas third-party data added.
- Its "Download JSON" zip actually contains a **file geodatabase** (`Electricity_Infrastructure.gdb`), not JSON. To use it you'd need GDAL (`ogr2ogr`) or its WFS:
  `https://services.ga.gov.au/gis/services/Electricity_Infrastructure/MapServer/WFSServer`

## Pipeline

```bash
# 1) Raw data (unzipped 150022 JSON folder → data/powerlines/, gitignored)
# 2) Clean/compact (keeps NAME, CLASS, OPERATIONALSTATUS, CAPACITYKV, STATE;
#    strips crs + verbose attrs; rounds coords to 6dp)
node scripts/build-powerlines.mjs data/powerlines --out data/powerlines/clean --points
#    powerlines.geojson 16.7MB → 9.2MB (45%), substations → 418KB, stations → 156KB

# 3) Vector tiles (install tippecanoe once: e.g. `choco install tippecanoe`
#    or use the Windows release from github.com/felt/tippecanoe)
tippecanoe -zg -Z6 -z14 -r1 -l powerlines -o powerlines.pmtiles powerlines.geojson
tippecanoe -zg -Z6 -z14 -r1 -l substations  -o substations.pmtiles  substations.geojson
#    (-r1 = keep every line vertex; -Z6 min zoom; -z14 max; expect ~1-3 MB archive)

# 4) Host: upload the .pmtiles to a public Supabase Storage bucket, e.g.
#    storage bucket `gis-data` → `powerlines.pmtiles`
#    public URL like:
#    https://<proj>.supabase.co/storage/v1/object/public/gis-data/powerlines.pmtiles
```

## App integration points (all existing patterns — no new infra)

1. **Service worker** — `src/service-worker.ts` already serves any archive:
   `/ftw-client-pmtiles/{z}/{x}/{y}.mvt?archive=<url>`. For a locally bundled
   archive we relax the archive regex (currently `/^https:\/\/.+\.pmtiles…/`)
   to also accept a same-origin path (`/powerlines.pmtiles`) so the PMTiles
   lib inside the SW range-fetches the bundled static file instead of
   Supabase. Optionally generalise the `FTW_` names later.
2. **Map source + layer** — mirror `src/lib/components/map/overlays/FtwPmtilesOverlay.svelte`:
   ```js
   map.addSource("powerlines", {
     type: "vector",
     tiles: [`/ftw-client-pmtiles/{z}/{x}/{y}.mvt?archive=${encodeURIComponent(PMTILES_URL)}`],
     minzoom: 0, maxzoom: 14,
     attribution: "© Geoscience Australia CC-BY 4.0",
   })
   map.addLayer({ id: "powerlines", type: "line", source: "powerlines",
     "source-layer": "powerlines", minzoom: POWER_LINE_MIN_ZOOM /* ~10 */,
     paint: { "line-color": ... } })
   ```
   - Guard with the existing `isStyleLoaded()` / scheduled-render pattern (see KmzOverlays note in repo memory).
   - Insert with the `ANCHOR_LAYER_IDS` lookup used by Kmz/Em overlays if it must sit under other layers.
   - Styling options from real attributes: width via `interpolate` on zoom; `line-color` by `CAPACITYKV` match (e.g. 66/#e5e7eb, 132/#f59e0b, 275/#ef4444, 330/#8b5cf6, 500/#f43f5e); optional dashed casing for `Underground`; `["get","OPERATIONALSTATUS"]` filter to hide non-operational.
   - Points (substations/stations) = small circle layers with `minzoom` higher (~11–12), optional.
3. **Toolbox toggle** — copy the `road_overlays_enabled` per-user pattern:
   `user_settings.power_lines_enabled` bool + store key + `account/+layout.svelte` hydration (both branches) + `userSettingsApi` update + a Toolbox button/menu row, gated in the toolbox grid. (Generic `updateMenuVisibility` exists but Road Overlays uses its own — either is fine.)
4. **Attribution**: dataset is CC-BY 4.0 — add `© Commonwealth of Australia (Geoscience Australia) 2025`, Creative Commons BY 4.0 in the source attribution / an about panel.

## Zoom / performance behaviour

- Layer `minzoom` ~10 = auto-hidden when zoomed out (no code needed for the "don't show zoomed out" ask).
- Vector tiles mean only in-view tiles download regardless of how far you pan (whole-country, no field dependency).
- `-r1` keeps line vertices crisp; if the archive is ever too big, tippecanoe `-S` simplification or dropping <66 kV features trims it further.

## Power poles / posts — OpenStreetMap route (concrete)

GA has **no poles/towers**. OSM is the only practical national source. Measured in your sample region (bbox `152.0,-32.4,153.2,-31.4`, ~mid-north-coast NSW): **3,343 poles/towers** — very manageable.

Fetch script (built + syntax-checked):

```bash
node scripts/fetch-osm-power.mjs --bbox "152.0,-32.4,153.2,-31.4" --out data/osm-power
#   → osm_power_poles.geojson  (Point per power=pole / power=tower, keeps name/operator/ref/voltage)
# add --lines to also pull power=line + power=minor_line ways (LineStrings)
```

Raw Overpass queries (run in Overpass Turbo — overpass-turbo.eu — if the public API is rate-limiting your IP, which happened to my sandbox: overpass-api.de 406, kumi 504):

```
// poles + towers (nodes)
[out:json][timeout:240];(node["power"="pole"](152.0,-32.4,153.2,-31.4);node["power"="tower"](152.0,-32.4,153.2,-31.4););out;
// + lines/minor lines (ways with geometry)
[out:json][timeout:300];(way["power"="line"](152.0,-32.4,153.2,-31.4);way["power"="minor_line"](152.0,-32.4,153.2,-31.4););out geom;
```

Whole-Australia options (heavier):
- **Overpass per state** (e.g. swap the bbox for `(area["name"="New South Wales"];)`) — poles/towers are densest around towns; rural coverage is sparse.
- **Geofabrik Australia `.osm.pbf`** + `osmium tags-filter` → filter `nwr[power=pole/power=tower/...]` → convert to GeoJSON (needs osmium/GDAL installed).

Then tile poles exactly like the lines. **Licence**: OSM data is ODbL share-alike — attribution "© OpenStreetMap contributors" + ODbL on the layer.

**Measured rural-WA coverage (2026-09-04)**: wheatbelt box around Northam (`-32.2,117.0,-31.2,117.8`, ~80×110 km) = **740 poles/towers + only 18 power line/minor_line ways** → OSM is partial in rural WA (a real network there has thousands of poles). Useful but NOT comprehensive for the small lines. ⚠️ Overpass bbox arg order = `(south,west,north,east)` lat,lon — using lon,lat order returns HTTP 400.

## WA / fuller local network (Western Power · Horizon Power)

GA is transmission-only (sparse in rural WA). The authoritative WA small-line data is licenced:
- **Western Power** = SWIS (south-west WA incl. wheatbelt, Goldfields–Esperance) — full 11/22/33/66/132 kV overhead network. Get via their "Network data" request page (westernpower.com.au/our-network/network-data) or `data.wa.gov.au` (portal was returning HTTP 500 on 2026-09-04 — retry in a normal browser).
- **Horizon Power** = regional/north WA (Mid West, Gascoyne, Pilbara, Kimberley) — separate data request.
- Both are typically free for farm/planning use but licenced (check terms), usually shapefile/GeoJSON/geodatabase.

**Adding such a file to the app** (already supported):
1. Put the export in `data/powerLines/` as GeoJSON in **lon/lat degrees** (if it's a projected MGA/GDA2020 zone, reproject to EPSG:4326 first in QGIS/ogr2ogr — the script assumes degrees).
2. Merge it over the national lines and rebuild the single layer the map reads:
   ```bash
   node scripts/build-powerlines.mjs data/powerLines --lines Electricity_Transmission_Lines.geojson WA_Network_Lines.geojson --out data/powerLines/clean
   Copy-Item data/powerLines/clean/powerlines.geojson static/powerLines/powerlines.geojson
   npx -y mapshaper static/powerLines/powerlines.geojson -simplify dp 12% keep-shapes -o static/powerLines/powerlines.geojson
   ```
   (The build script also keeps a `VOLTAGE` property if the export uses that instead of `CAPACITYKV`, so the capacity colouring keeps working. Add a small `"STATE"` note: the map colours by `CAPACITYKV`/`VOLTAGE`.)

## Status — FINAL (2026-09-04)

**National layer** (local static GeoJSON, GA): shipped, `static/powerLines/powerlines.geojson`,
rendered as a native `geojson` source with a `["!=", ["get","STATE"], "WA"]` filter so it now
only covers states OTHER than WA (WA uses the full-detail Western Power data below — no double draw).

**WA distribution lines + poles (Western Power, licenced):** hosted as **Mapbox tilesets** (Option C),
built with the pure-JS pipeline (`scripts/tile-powerlines.mjs` → pmtiles → `scripts/pmtiles2mbtiles.mjs`
→ mbtiles → Data Workbench upload):

| Dataset | Tileset ID | Source-layer | Props | Zooms |
|---|---|---|---|---|
| WA lines (WP-031, 200,039) | `luchodore.pit699` | `powerlines` | `kv` (STRING, e.g. `"0.415…"`, `"22"`), `pick_id` | 4–14 |
| WA poles (WP-029, 796,375) | `luchodore.rzpget` | `poles` | `pick_id`, `pole_type` (`WOOD`/`CONCRETE`/`METAL`/`METAL_LIGHTING`/…) | 4–15 |

Wiring lives in `src/lib/components/map/overlays/PowerLinesOverlay.svelte`:
- `powerlines-national[-casing]` — local GeoJSON, non‑WA only.
- `powerlines-wa[-casing]` — WA lines, `kv` step colour ramp (LV 415 V slate → 33 kV red).
- `power-poles` — WA poles, circles, `pole_type` colour, **excludes `METAL_LIGHTING`**
  (street lights, not network poles). Lines + poles both appear from `minzoom 12`.
- Toggles: Layers menu **Power Lines** (`powerLines`) + **Power Poles** (`powerPoles`, store + row added).

**⚠️ mapbox-gl v1.13 gotchas (bite anyone who re-wires this):**
1. v1.13 does **NOT** support `mapbox://tilesets/<id>` source URLs — it mangles the request to
   `/v4/tilesets.json` → 404. Use explicit `tiles` array URLs instead:
   `https://api.mapbox.com/v4/{tilesetId}/{z}/{x}/{y}.vector.pbf?access_token=<pk>` + `minzoom`/`maxzoom`/`attribution`.
2. Don't include `layout: undefined` on a layer spec (circle layers have no layout) — Mapbox throws
   `layers.<id>.layout: object expected, undefined found`. Omit the key unless defined.
3. WA `kv` is a **string**/null in the tiles — coerce with
   `["step", ["coalesce", ["to-number", ["get","kv"]], 0], …]` or every line renders the base colour
   and the console spams "Expected value to be of type number".
4. Poles tile upload originally failed (`Tile exceeds maximum size of 500k at z4`): all 796k points land
   in ~1 z4 tile. Fixed with `--maxpoints 12000` (even stride sub-sample) in `tile-powerlines.mjs`.
   Only pure-point tiles are capped (geojson-vt internal format: `feature.type === 1`, NOT
   `geometry.type === "Point"`).

Attribution: `© Western Power` is set in both tilesets' metadata AND on the vector sources;
`© Commonwealth of Australia (Geoscience Australia) CC-BY 4.0` for national.

**Field-boundary filter (2026-09-04, default ON):** by default the overlay only shows lines/poles
that touch the operator's mapped paddocks (`mapFieldsStore` boundaries, buffered **1000 m**). The
subset is computed by `src/lib/utils/powerNearFields.js` — it decodes the few Mapbox vector tiles
overlapping the buffered fields (`@mapbox/vector-tile` + `pbf`, turf `booleanIntersects` tested
against EACH paddock's OWN buffer — never a `turf.union` of all buffers, which silently drops poles
inside fields), excludes `METAL_LIGHTING` poles and keeps poles that lie within 40 m of a kept near
line, then renders the result as local GeoJSON sources (`powerlines-near` / `power-poles-near`).
Turning on **Show Outside Fields** (Layers menu, store key `powerOutsideFields`, default **false**)
hides the near layers and shows the full national + WA network again. If the near-fields decode ever
fails it falls back to the full network.

**First-load render bug — RESOLVED (2026-09-04):** near lines/poles repeatedly failed to appear on a
fresh map load until the user toggled Show Outside Fields OFF/ON. Fixes that landed together in
`PowerLinesOverlay.svelte`:
1. `styleReady()` checks ONLY `map.isStyleLoaded()` (a busy live map never reaches `map.loaded()`, so
   layers were never added).
2. `ensureEventuallyAdded()` — a 400 ms fallback interval (20 s cap) that adds the base WA layers once
   the style is ready, driven from both `onMount` and the `map` prop init, so a missed
   `style.load`/`idle` event can't leave the overlay permanently un-added.
3. If the near-fields decode finishes while the style is still settling, a 250 ms retry re-runs
   `ensureNearSourcesAndLayers()` + `applyVisibility()` until they land, plus reconcile passes at
   500/2000/5000 ms. Layers are also added while hidden (visibility handled separately), so a later
   toggle never races. Verified on the 98-field live map: first load now logs `overlay ready` →
   `near-fields: N lines, M poles` with no interaction needed.

