// src/lib/types.ts

export type FileUpload = {
  id: string
  name: string
  path: string
  uploadedDate: string // ISO string
  status: "Pending" | "Processed" | "Failed"
  message: string
}

export interface Paddock {
  name: string
  boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon
  properties: Record<string, any>
  status: null | "accepted" | "rejected" | "warning"
  area?: number
  isMultiPolygon?: boolean
  polygon_areas?: {
    individual_areas: number[]
    total_area: number
  } | null
  farm_id?: string
}
