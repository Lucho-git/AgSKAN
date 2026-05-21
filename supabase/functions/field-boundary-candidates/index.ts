import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

type Bbox = {
    xmin: number
    ymin: number
    xmax: number
    ymax: number
}

const DEFAULT_YEAR = 2025

function corsHeaders(origin: string) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type",
    }
}

function isValidBbox(bbox: unknown): bbox is Bbox {
    if (!bbox || typeof bbox !== "object") return false
    const value = bbox as Record<string, unknown>
    return ["xmin", "ymin", "xmax", "ymax"].every(
        (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    )
}

function getAreaHa(bbox: Bbox) {
    const centerLat = (bbox.ymin + bbox.ymax) / 2
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng =
        metersPerDegreeLat * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01)
    const widthMeters = Math.abs(bbox.xmax - bbox.xmin) * metersPerDegreeLng
    const heightMeters = Math.abs(bbox.ymax - bbox.ymin) * metersPerDegreeLat
    return Math.round(((widthMeters * heightMeters) / 10000) * 10) / 10
}

function createCandidate(bbox: Bbox, index: number, year: number) {
    const width = bbox.xmax - bbox.xmin
    const height = bbox.ymax - bbox.ymin
    const xmin = bbox.xmin + width * (0.13 + index * 0.18)
    const ymin = bbox.ymin + height * (0.12 + index * 0.12)
    const xmax = Math.min(xmin + width * 0.25, bbox.xmax - width * 0.06)
    const ymax = Math.min(ymin + height * 0.2, bbox.ymax - height * 0.06)
    const candidateBbox = { xmin, ymin, xmax, ymax }

    return {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [
                [
                    [xmin, ymin],
                    [xmax, ymin + height * 0.015],
                    [xmax - width * 0.025, ymax],
                    [xmin + width * 0.025, ymax - height * 0.01],
                    [xmin, ymin],
                ],
            ],
        },
        properties: {
            ftw_id: `edge-mock-ftw-${year}-${index + 1}`,
            provider: "edge-mock",
            time: `${year}-01-01T00:00:00Z`,
            area_ha: getAreaHa(candidateBbox),
        },
    }
}

serve(async (request) => {
    const origin = request.headers.get("origin") || "*"
    const headers = corsHeaders(origin)

    if (request.method === "OPTIONS") {
        return new Response("ok", { headers })
    }

    try {
        const body = await request.json()
        const bbox = body?.bbox
        const year = Number.isFinite(body?.year) ? body.year : DEFAULT_YEAR

        if (!isValidBbox(bbox)) {
            return new Response(JSON.stringify({ error: "A valid bbox is required" }), {
                status: 400,
                headers: { ...headers, "Content-Type": "application/json" },
            })
        }

        return new Response(
            JSON.stringify({
                type: "FeatureCollection",
                features: [0, 1, 2].map((index) =>
                    createCandidate(bbox, index, year),
                ),
            }),
            { headers: { ...headers, "Content-Type": "application/json" } },
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...headers, "Content-Type": "application/json" },
        })
    }
})