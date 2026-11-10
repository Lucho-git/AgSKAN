// src/lib/services/trailGeojson.ts
// The full recorded GPS path of a trail, via the get_trail_geojson RPC.

/* eslint-disable @typescript-eslint/no-explicit-any -- supabase client is untyped here */

export interface TrailLineGeometry {
  type: "LineString" | "MultiLineString"
  coordinates: any[]
}

/**
 * Fetch a trail's path. Returns null when the RPC returns something that
 * isn't a line with at least two parts; throws on an RPC error.
 */
export async function fetchTrailGeojson(
  client: any,
  trailId: string,
): Promise<TrailLineGeometry | null> {
  const { data, error } = await client.rpc("get_trail_geojson", {
    p_trail_id: trailId,
  })
  if (error) throw error
  const path = data?.path_geojson
  if (
    (path?.type === "LineString" || path?.type === "MultiLineString") &&
    path.coordinates?.length >= 2
  ) {
    return path
  }
  return null
}
