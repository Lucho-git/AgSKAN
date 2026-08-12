// src/lib/api/markerPhotoApi.ts
// Marker photo persistence. Photo METADATA ({ id, path, created_at }) lives in
// map_markers.marker_data.properties.photos (preserved by MapStateSaver), and
// the actual image files live in Supabase Storage (user_files_bucket). Signed
// URLs are generated at display time since the bucket is private.
import { supabase } from "$lib/supabaseClient"
import { get } from "svelte/store"
import { profileStore } from "$lib/stores/profileStore"

export interface MarkerPhotoMeta {
  id: string
  path: string
  created_at: string
}

export interface MarkerPhoto extends MarkerPhotoMeta {
  url: string
}

const BUCKET = "user_files_bucket"
const PHOTO_DIR = "marker-photos"
const URL_TTL_SECONDS = 3600

// Photos are stored map-scoped so any member of the map can view/edit them:
//   maps/{master_map_id}/marker-photos/{marker_id}/{file}
async function getMasterMapId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data?.session?.user?.id) throw new Error("Not authenticated")
  const masterMapId = get(profileStore).master_map_id
  if (!masterMapId) throw new Error("No map selected")
  return masterMapId
}

function photoList(markerData: any): MarkerPhotoMeta[] {
  return markerData?.properties?.photos || []
}

export const markerPhotoApi = {
  /** Fetch a marker's photo metadata (paths) straight from the DB. */
  async fetchPhotoMeta(markerId: string): Promise<MarkerPhotoMeta[]> {
    const { data, error } = await supabase
      .from("map_markers")
      .select("marker_data")
      .eq("id", markerId)
      .single()
    if (error) {
      console.error("Error fetching marker photos:", error)
      return []
    }
    return photoList(data?.marker_data)
  },

  /** Turn photo metadata into displayable entries with fresh signed URLs. */
  async getSignedUrls(meta: MarkerPhotoMeta[]): Promise<MarkerPhoto[]> {
    const withUrls = await Promise.all(
      (meta || []).map(async (p) => {
        try {
          const { data } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(p.path, URL_TTL_SECONDS)
          return { ...p, url: data?.signedUrl || "" }
        } catch (e) {
          console.error("Error signing photo URL:", e)
          return { ...p, url: "" }
        }
      }),
    )
    return withUrls
  },

  /** Convenience: load photos for a marker with fresh URLs in one call. */
  async getPhotos(
    markerId: string,
  ): Promise<{ success: boolean; photos?: MarkerPhoto[]; message?: string }> {
    try {
      const meta = await markerPhotoApi.fetchPhotoMeta(markerId)
      const photos = await markerPhotoApi.getSignedUrls(meta)
      return { success: true, photos }
    } catch (error: any) {
      console.error("Error loading marker photos:", error)
      return { success: false, message: error?.message || "Failed to load photos" }
    }
  },

  /** Upload an image blob and attach its metadata to the marker. */
  async addPhoto(
    markerId: string,
    blob: Blob,
  ): Promise<{ success: boolean; photo?: MarkerPhoto; message?: string }> {
    try {
      const masterMapId = await getMasterMapId()
      const id = crypto.randomUUID()
      const ext = blob.type === "image/png" ? "png" : "jpg"
      const path = `maps/${masterMapId}/${PHOTO_DIR}/${markerId}/${id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, {
          contentType: blob.type || "image/jpeg",
          upsert: false,
        })
      if (uploadError) throw new Error(uploadError.message)

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, URL_TTL_SECONDS)

      const photo: MarkerPhoto = {
        id,
        path,
        created_at: new Date().toISOString(),
        url: signed?.signedUrl || "",
      }

      // Append to marker_data.properties.photos (preserving everything else).
      const { data: cur } = await supabase
        .from("map_markers")
        .select("marker_data")
        .eq("id", markerId)
        .single()
      const existing = cur?.marker_data || {}
      const next = {
        ...existing,
        properties: {
          ...(existing.properties || {}),
          photos: [...photoList(cur?.marker_data), photo],
        },
      }

      const { error: updateError } = await supabase
        .from("map_markers")
        .update({
          marker_data: next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", markerId)
      if (updateError) throw new Error(updateError.message)

      return { success: true, photo }
    } catch (error: any) {
      console.error("Error adding marker photo:", error)
      return { success: false, message: error?.message || "Failed to save photo" }
    }
  },

  /** Delete a photo (storage file + marker metadata). */
  async deletePhoto(
    markerId: string,
    photo: MarkerPhotoMeta,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      await supabase.storage.from(BUCKET).remove([photo.path])

      const { data: cur } = await supabase
        .from("map_markers")
        .select("marker_data")
        .eq("id", markerId)
        .single()
      const existing = cur?.marker_data || {}
      const photos = photoList(cur?.marker_data).filter(
        (p) => p.id !== photo.id,
      )
      const next = {
        ...existing,
        properties: {
          ...(existing.properties || {}),
          photos,
        },
      }

      const { error } = await supabase
        .from("map_markers")
        .update({
          marker_data: next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", markerId)
      if (error) throw new Error(error.message)

      return { success: true }
    } catch (error: any) {
      console.error("Error deleting marker photo:", error)
      return { success: false, message: error?.message || "Failed to delete photo" }
    }
  },
}
