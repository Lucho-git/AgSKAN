// src/lib/api/kmzOverlayApi.ts
// Experimental per-map overlay layers from user-uploaded KMZ/KML files
// (e.g. roads drawn in Google Earth and exported as a KMZ).
//
// Storage layout (matches user_files_bucket conventions):
//   user_<userId>/kmz_overlays/<fileName>
//
// DB table: public.kmz_overlays (see supabase/migrations/add_kmz_overlays.sql)
//   id, map_id, name, source_file, geojson (jsonb), style (jsonb), created_at, updated_at
import { supabase } from "$lib/supabaseClient"
import { kml } from "@tmcw/togeojson"

// Geometry types we want to keep for road overlays. Paddock processing
// (processBoundariesApi) drops everything except polygons — roads are lines,
// so we deliberately keep LineString/MultiLineString (and points/polygons).
const SUPPORTED_GEOMETRIES = new Set([
  "LineString",
  "MultiLineString",
  "Point",
  "MultiPoint",
  "Polygon",
  "MultiPolygon",
])

function describeApiError(error: any) {
  if (!error || typeof error !== "object") return error?.message || String(error || "Unknown error")
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(" | ")
}

/** Strip the altitude (3rd) component from a coordinate pair. */
function stripCoord(coord: any): [number, number] {
  if (!Array.isArray(coord)) return coord
  return [coord[0], coord[1]]
}

/** Recursively strip Z values from any geometry's coordinates. */
function stripZFromGeometry(geometry: any): any {
  if (!geometry || !geometry.type) return geometry
  switch (geometry.type) {
    case "Point":
      return { ...geometry, coordinates: stripCoord(geometry.coordinates) }
    case "MultiPoint":
    case "LineString":
      return { ...geometry, coordinates: geometry.coordinates.map(stripCoord) }
    case "MultiLineString":
    case "Polygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring: any[]) => ring.map(stripCoord)),
      }
    case "MultiPolygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((poly: any[][]) =>
          poly.map((ring: any[]) => ring.map(stripCoord)),
        ),
      }
    case "GeometryCollection":
      return {
        ...geometry,
        geometries: (geometry.geometries || []).map(stripZFromGeometry),
      }
    default:
      return geometry
  }
}

/** Extract a human-friendly name for an overlay from a filename. */
export function overlayNameFromFileName(fileName: string): string {
  const base = (fileName || "").replace(/\.[^/.]+$/, "").trim()
  if (!base) return "KMZ Overlay"
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "KMZ Overlay"
}

/**
 * Parse a KML string into a GeoJSON FeatureCollection using @tmcw/togeojson.
 * Keeps line/point/polygon geometries and strips altitude coordinates.
 */
function kmlStringToGeoJSON(kmlText: string): GeoJSON.FeatureCollection {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is not available in this environment")
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(kmlText, "text/xml")

  const parserError = doc.getElementsByTagName("parsererror")[0]
  if (parserError) {
    throw new Error(`Invalid KML structure: ${parserError.textContent || "parser error"}`)
  }

  const geojson = kml(doc) as GeoJSON.FeatureCollection
  if (!geojson || !Array.isArray(geojson.features)) {
    throw new Error("No features found in KML")
  }

  const features = geojson.features
    .filter((feature) => {
      if (!feature || !feature.geometry) return false
      return SUPPORTED_GEOMETRIES.has(feature.geometry.type)
    })
    .map((feature, index) => {
      const props = (feature.properties || {}) as Record<string, unknown>
      const name =
        typeof props.name === "string" && props.name.trim()
          ? props.name.trim()
          : typeof props.Name === "string" && props.Name.trim()
            ? props.Name.trim()
            : `Road ${index + 1}`
      return {
        ...feature,
        geometry: stripZFromGeometry(feature.geometry),
        properties: { ...props, name },
      }
    })

  return { type: "FeatureCollection", features }
}

/** Convert a File (.kmz or .kml) into a GeoJSON FeatureCollection. */
export async function fileToGeoJSON(file: File): Promise<GeoJSON.FeatureCollection> {
  const ext = file.name.split(".").pop()?.toLowerCase()

  if (ext === "kmz") {
    // A KMZ is a ZIP archive containing doc.kml
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(file)
    const kmlNames = Object.keys(zip.files).filter(
      (name) =>
        !zip.files[name].dir && name.toLowerCase().endsWith(".kml") && !name.startsWith("__MACOSX"),
    )
    if (kmlNames.length === 0) {
      throw new Error("KMZ file does not contain a .kml document")
    }
    // Prefer doc.kml (Google Earth default), otherwise the first KML found
    const kmlName =
      kmlNames.find((n) => n.toLowerCase() === "doc.kml") ||
      kmlNames.sort((a, b) => a.length - b.length)[0]
    const kmlText = await zip.file(kmlName)!.async("text")
    return kmlStringToGeoJSON(kmlText)
  }

  if (ext === "kml") {
    return kmlStringToGeoJSON(await file.text())
  }

  if (ext === "geojson" || ext === "json") {
    const geojson = JSON.parse(await file.text()) as GeoJSON.FeatureCollection
    if (!geojson || !Array.isArray(geojson.features)) {
      throw new Error("GeoJSON file does not contain a FeatureCollection")
    }
    return {
      type: "FeatureCollection",
      features: geojson.features
        .filter((f) => f.geometry && SUPPORTED_GEOMETRIES.has(f.geometry.type))
        .map((f, i) => ({
          ...f,
          geometry: stripZFromGeometry(f.geometry),
          properties: {
            ...(f.properties || {}),
            name:
              (f.properties as any)?.name || (f.properties as any)?.Name || `Feature ${i + 1}`,
          },
        })),
    }
  }

  throw new Error(`Unsupported file type: .${ext || "unknown"} (expected .kmz, .kml, or .geojson)`)
}

/** Resolve the authenticated user's master map id. */
async function getMasterMapId(): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  if (!session?.session?.user) throw new Error("Not authenticated")

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("master_map_id")
    .eq("id", session.session.user.id)
    .single()

  if (profileError) throw new Error(`Profile error: ${profileError.message}`)
  if (!profileData?.master_map_id) throw new Error("No master map associated with user")
  return profileData.master_map_id
}

export const kmzOverlayApi = {
  /**
   * Upload a KMZ/KML file, convert it to GeoJSON, and store it as an overlay
   * for the user's master map.
   */
  async uploadOverlay(
    file: File,
    options: { name?: string; color?: string } = {},
  ): Promise<{ success: boolean; overlay?: any; message?: string; geojson?: any }> {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.user) throw new Error("Not authenticated")
      const userId = session.session.user.id

      // Convert first so we fail fast on bad files before touching storage
      const geojson = await fileToGeoJSON(file)
      if (geojson.features.length === 0) {
        throw new Error("No line/polygon geometries found in file")
      }

      const mapId = await getMasterMapId()

      const storagePath = `user_${userId}/kmz_overlays/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("user_files_bucket")
        .upload(storagePath, file, { upsert: true })

      if (uploadError) {
        console.error("KMZ overlay storage upload error:", uploadError)
        throw new Error(`Could not upload file: ${uploadError.message}`)
      }

      const name = options.name || overlayNameFromFileName(file.name)

      const { data, error } = await supabase
        .from("kmz_overlays")
        .insert({
          map_id: mapId,
          name,
          source_file: file.name,
          geojson,
          style: {
            color: options.color || "#fbbf24",
            width: 2,
            dashed: false,
          },
        })
        .select("*")
        .single()

      if (error) {
        // Clean up the stored file if the DB insert failed
        await supabase.storage.from("user_files_bucket").remove([storagePath])
        throw new Error(`Could not save overlay: ${error.message}`)
      }

      return { success: true, overlay: data, geojson }
    } catch (error: any) {
      console.error("Error uploading KMZ overlay:", error)
      return { success: false, message: error.message || "Failed to upload overlay" }
    }
  },

  /** Load all overlays for the authenticated user's master map. */
  async loadOverlays(): Promise<{ success: boolean; overlays?: any[]; error?: string }> {
    try {
      const mapId = await getMasterMapId()

      const { data, error } = await supabase
        .from("kmz_overlays")
        .select("*")
        .eq("map_id", mapId)
        .order("created_at", { ascending: true })

      if (error) throw new Error(error.message)

      return { success: true, overlays: data || [] }
    } catch (error: any) {
      console.error("Error loading KMZ overlays:", error)
      return { success: false, error: describeApiError(error) }
    }
  },

  /**
   * Update an overlay's GeoJSON and/or cluster-level style (defaults).
   * Used when a road's name/color/dash style changes, or the cluster defaults
   * (color, solid/dashed) are edited.
   */
  async updateOverlay(
    overlayId: string,
    updates: { geojson?: any; style?: Record<string, unknown>; name?: string },
  ): Promise<{ success: boolean; overlay?: any; message?: string }> {
    try {
      console.log("[kmz-overlay] updateOverlay payload →", {
        id: overlayId,
        hasGeojson: !!updates.geojson,
        featureCount: updates.geojson?.features?.length,
        coloredFeatures: (updates.geojson?.features || [])
          .map((f: any, i: number) => ({
            i,
            color: f?.properties?.color || null,
            width: f?.properties?.width ?? null,
          }))
          .filter((x: any) => x.color || x.width != null),
        style: updates.style,
      })

      const { data, error } = await supabase
        .from("kmz_overlays")
        .update(updates)
        .eq("id", overlayId)
        .select("*")
        .single()

      if (error) throw new Error(error.message)

      console.log("[kmz-overlay] updateOverlay response →", {
        id: data?.id,
        featureCount: data?.geojson?.features?.length,
        coloredFeatures: (data?.geojson?.features || [])
          .map((f: any, i: number) => ({
            i,
            color: f?.properties?.color || null,
            width: f?.properties?.width ?? null,
          }))
          .filter((x: any) => x.color || x.width != null),
        style: data?.style,
      })

      return { success: true, overlay: data }
    } catch (error: any) {
      console.error("Error updating KMZ overlay:", error)
      return { success: false, message: error.message || "Failed to update overlay" }
    }
  },

  /** Delete an overlay by id. */
  async deleteOverlay(overlayId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const { data: existing, error: fetchError } = await supabase
        .from("kmz_overlays")
        .select("source_file, map_id")
        .eq("id", overlayId)
        .single()

      if (fetchError) throw new Error(fetchError.message)

      const { error } = await supabase.from("kmz_overlays").delete().eq("id", overlayId)
      if (error) throw new Error(error.message)

      // Best-effort cleanup of the stored source file
      if (existing?.source_file) {
        const { data: session } = await supabase.auth.getSession()
        const userId = session?.session?.user?.id
        if (userId) {
          await supabase.storage
            .from("user_files_bucket")
            .remove([`user_${userId}/kmz_overlays/${existing.source_file}`])
        }
      }

      return { success: true }
    } catch (error: any) {
      console.error("Error deleting KMZ overlay:", error)
      return { success: false, message: error.message || "Failed to delete overlay" }
    }
  },
}
