import { build, files, prerendered, version } from "$service-worker"
import { PMTiles } from "pmtiles"
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching"

const CACHE_VERSION = version || 1
const FTW_PMTILES_URL =
  "https://data.source.coop/ftw/global-data/predictions/vectors/alpha/global.pmtiles"
const FTW_CLIENT_TILE_PATH = /^\/ftw-client-pmtiles\/(\d+)\/(\d+)\/(\d+)\.mvt$/
const ftwArchives = new Map<string, PMTiles>()

const precache_list = [...build, ...files, ...prerendered].map((s) => ({
  url: s,
  revision: CACHE_VERSION,
}))

precacheAndRoute(precache_list)

function getFtwArchive(archiveUrl: string) {
  let archive = ftwArchives.get(archiveUrl)
  if (!archive) {
    archive = new PMTiles(archiveUrl)
    ftwArchives.set(archiveUrl, archive)
  }
  return archive
}

function getFtwClientTileResponse(request: Request) {
  const url = new URL(request.url)
  const match = url.pathname.match(FTW_CLIENT_TILE_PATH)
  if (!match) return null

  return (async () => {
    const archiveUrl = url.searchParams.get("archive") || FTW_PMTILES_URL
    if (!/^https:\/\/.+\.pmtiles(?:[?#].*)?$/i.test(archiveUrl)) {
      return new Response("Invalid PMTiles archive URL", { status: 400 })
    }

    try {
      const z = Number(match[1])
      const x = Number(match[2])
      const y = Number(match[3])
      const archive = getFtwArchive(archiveUrl)
      const tile = await archive.getZxy(z, x, y, request.signal)
      const headers = new Headers({
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": tile?.cacheControl || "public, max-age=86400",
      })

      if (tile?.expires) headers.set("Expires", tile.expires)
      if (tile?.etag) headers.set("ETag", tile.etag)

      return new Response(tile?.data || new Uint8Array(), {
        status: 200,
        headers,
      })
    } catch (error) {
      console.warn("[FTW PMTiles] Client tile request failed", error)
      return new Response("FTW PMTiles tile request failed", { status: 502 })
    }
  })()
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return
  const tileResponse = getFtwClientTileResponse(event.request)
  if (tileResponse) event.respondWith(tileResponse)
})

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_VERSION) {
              return caches.delete(cacheName)
            }
          }),
        )
      }),
    ]),
  )
})

self.addEventListener("push", function (event) {
  const data = event.data.json()
  const options = {
    body: data.body,
    icon: "/favicon.png",
    badge: "/badge.png",
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow("https://www.skanfarming.com.au/account"))
})
