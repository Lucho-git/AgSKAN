import { PUBLIC_SUPABASE_URL } from "$env/static/public"
import { supabase } from "$lib/supabaseClient"

export type FieldBoundaryBbox = {
    xmin: number
    ymin: number
    xmax: number
    ymax: number
}

type FieldBoundaryCandidateRequest = {
    bbox: FieldBoundaryBbox
    year?: number
    limit?: number
    source?: "mock" | "edge" | "local"
}

type GeoJsonFeatureCollection = {
    type: "FeatureCollection"
    features: Array<Record<string, unknown>>
}

const FUNCTION_NAME = "field-boundary-candidates"
const DEFAULT_YEAR = 2025

function getCandidateSource() {
    if (typeof window === "undefined") return "mock"
    return window.localStorage.getItem("agskan-field-candidate-source") || "mock"
}

function getLocalCandidateUrl() {
    if (typeof window === "undefined") {
        return "http://127.0.0.1:8787/field-boundary-candidates"
    }

    return (
        window.localStorage.getItem("agskan-field-candidate-local-url") ||
        "http://127.0.0.1:8787/field-boundary-candidates"
    )
}

function getAreaHa(bbox: FieldBoundaryBbox) {
    const centerLat = (bbox.ymin + bbox.ymax) / 2
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng =
        metersPerDegreeLat * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01)
    const widthMeters = Math.abs(bbox.xmax - bbox.xmin) * metersPerDegreeLng
    const heightMeters = Math.abs(bbox.ymax - bbox.ymin) * metersPerDegreeLat
    return Math.round(((widthMeters * heightMeters) / 10000) * 10) / 10
}

function createMockPolygon(
    bbox: FieldBoundaryBbox,
    id: string,
    year: number,
    index: number,
) {
    const width = bbox.xmax - bbox.xmin
    const height = bbox.ymax - bbox.ymin
    const insetX = width * (0.12 + index * 0.17)
    const insetY = height * (0.12 + index * 0.12)
    const polygonWidth = width * 0.26
    const polygonHeight = height * 0.2
    const wobble = width * 0.035

    const xmin = bbox.xmin + insetX
    const ymin = bbox.ymin + insetY
    const xmax = Math.min(xmin + polygonWidth, bbox.xmax - width * 0.06)
    const ymax = Math.min(ymin + polygonHeight, bbox.ymax - height * 0.06)

    const candidateBbox = { xmin, ymin, xmax, ymax }

    return {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [
                [
                    [xmin, ymin],
                    [xmax - wobble, ymin + height * 0.02],
                    [xmax, ymax - height * 0.035],
                    [xmin + wobble, ymax],
                    [xmin, ymin],
                ],
            ],
        },
        properties: {
            ftw_id: id,
            provider: "mock",
            time: `${year}-01-01T00:00:00Z`,
            area_ha: getAreaHa(candidateBbox),
        },
    }
}

function getMockCandidates(
    request: FieldBoundaryCandidateRequest,
): GeoJsonFeatureCollection {
    const year = request.year || DEFAULT_YEAR
    return {
        type: "FeatureCollection",
        features: [0, 1, 2].map((index) =>
            createMockPolygon(request.bbox, `mock-ftw-${year}-${index + 1}`, year, index),
        ),
    }
}

async function getEdgeCandidates(
    request: FieldBoundaryCandidateRequest,
): Promise<GeoJsonFeatureCollection> {
    const {
        data: { session },
    } = await supabase.auth.getSession()

    const response = await fetch(
        `${PUBLIC_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session?.access_token || ""}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        },
    )

    if (!response.ok) {
        const message = await response.text()
        throw new Error(message || "Failed to load field candidates")
    }

    return response.json()
}

async function getLocalCandidates(
    request: FieldBoundaryCandidateRequest,
): Promise<GeoJsonFeatureCollection> {
    const response = await fetch(getLocalCandidateUrl(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            bbox: request.bbox,
            year: request.year,
            limit: request.limit,
        }),
    })

    if (!response.ok) {
        const message = await response.text()
        throw new Error(message || "Failed to load local field candidates")
    }

    return response.json()
}

export const fieldBoundaryCandidatesApi = {
    async getCandidates(
        request: FieldBoundaryCandidateRequest,
    ): Promise<GeoJsonFeatureCollection> {
        const source = request.source || getCandidateSource()

        if (source === "edge") {
            return getEdgeCandidates(request)
        }

        if (source === "local") {
            return getLocalCandidates(request)
        }

        await new Promise((resolve) => window.setTimeout(resolve, 180))
        return getMockCandidates(request)
    },
}