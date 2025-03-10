import { redirect, fail } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

export const actions = {
  connectToMap: async ({ locals, request }) => {
    const session = await locals.getSession()
    if (!session) {
      return fail(401, { message: "Unauthorized" })
    }

    const formData = await request.formData()
    const mapIdToJoin = formData.get("mapId")

    if (!mapIdToJoin) {
      return fail(400, { message: "Map ID is required" })
    }

    // Check if the map exists
    const { data: mapData, error: mapError } = await locals.supabase
      .from("master_maps")
      .select("id")
      .eq("id", mapIdToJoin)
      .single()

    if (mapError || !mapData) {
      return fail(404, { message: "Map not found" })
    }

    // Get the first operation for this master map
    const { data: operationData, error: operationError } = await locals.supabase
      .from("operations")
      .select("id")
      .eq("master_map_id", mapIdToJoin)
      .limit(1)
      .single()

    if (operationError) {
      return fail(500, { message: "Failed to fetch operation data" })
    }

    // Get the current user's profile, including recent_maps
    const { data: userData, error: userError } = await locals.supabase
      .from("profiles")
      .select("recent_maps")
      .eq("id", session.user.id)
      .single()

    if (userError) {
      return fail(500, { message: "Failed to fetch user data" })
    }

    // Update recent_maps
    let recentMaps = userData.recent_maps || []
    recentMaps = recentMaps.filter((id) => id !== mapIdToJoin)
    recentMaps.unshift(mapIdToJoin)
    recentMaps = recentMaps.slice(0, 10)

    // Update the user's profile with the new master_map_id, recent_maps, and selected_operation_id
    const { error: updateError } = await locals.supabase
      .from("profiles")
      .update({
        master_map_id: mapIdToJoin,
        recent_maps: recentMaps,
        selected_operation_id: operationData?.id || null,
      })
      .eq("id", session.user.id)

    if (updateError) {
      return fail(500, { message: "Failed to connect to map" })
    }

    return { success: true, message: "Successfully connected to map" }
  },

  createAndJoinMap: async ({ locals, request }) => {
    const session = await locals.getSession()
    if (!session) {
      return fail(401, { message: "Unauthorized" })
    }

    const formData = await request.formData()
    const mapName = formData.get("mapName")
    const mapId = formData.get("mapId")

    if (!mapName || !mapId) {
      return fail(400, { message: "Map name and ID are required" })
    }

    // Create the new map
    const { data: masterMap, error: insertError } = await locals.supabase
      .from("master_maps")
      .insert({
        id: mapId,
        master_user_id: session.user.id,
        map_name: mapName,
      })
      .single()

    if (insertError) {
      return fail(500, { message: "Failed to create map" })
    }

    // Create the default operation for this map
    const { error: operationError } = await locals.supabase
      .from("operations")
      .insert({
        master_map_id: mapId,
        name: "Farm Management",
        year: 2024,
        description: `Completing work around '${mapName}'s farm`,
      })

    if (operationError) {
      return fail(500, { message: "Failed to create default operation" })
    }

    // Now connect to the newly created map
    const { error: updateError } = await locals.supabase
      .from("profiles")
      .update({ master_map_id: mapId })
      .eq("id", session.user.id)

    if (updateError) {
      return fail(500, { message: "Failed to connect to map" })
    }

    return { success: true, message: "Successfully created and joined map" }
  },

  disconnectFromMap: async ({ locals }) => {
    const session = await locals.getSession()
    if (!session) {
      return fail(401, { message: "Unauthorized" })
    }

    const { error } = await locals.supabase
      .from("profiles")
      .update({ master_map_id: null })
      .eq("id", session.user.id)

    if (error) {
      return fail(500, { message: "Failed to disconnect from map" })
    }

    return { success: true, message: "Successfully disconnected from map" }
  },

  kickUser: async ({ locals, request }) => {
    const session = await locals.getSession()
    if (!session) {
      return fail(401, { message: "Unauthorized" })
    }

    const formData = await request.formData()
    const userIdToKick = formData.get("userId")

    // Add logic to check if the current user has permission to kick

    const { error } = await locals.supabase
      .from("profiles")
      .update({ master_map_id: null })
      .eq("id", userIdToKick)

    if (error) {
      return fail(500, { message: "Failed to kick user" })
    }

    return { success: true, message: "Successfully kicked user from map" }
  },

  renameMap: async ({ locals, request }) => {
    const session = await locals.getSession()
    if (!session) {
      return fail(401, { message: "Unauthorized" })
    }

    const formData = await request.formData()
    const mapId = formData.get("mapId")
    const newMapName = formData.get("newMapName")

    if (!mapId || !newMapName) {
      return fail(400, { message: "Map ID and new map name are required" })
    }

    // Check if the user is the owner of the map
    const { data: mapData, error: mapError } = await locals.supabase
      .from("master_maps")
      .select("master_user_id")
      .eq("id", mapId)
      .single()

    if (mapError || !mapData) {
      return fail(404, { message: "Map not found" })
    }

    if (mapData.master_user_id !== session.user.id) {
      return fail(403, {
        message: "You do not have permission to rename this map",
      })
    }

    // Rename the map
    const { error: updateError } = await locals.supabase
      .from("master_maps")
      .update({ map_name: newMapName })
      .eq("id", mapId)

    if (updateError) {
      return fail(500, { message: "Failed to rename map" })
    }

    return { success: true, message: "Successfully renamed map" }
  },
  deleteMap: async ({ locals, request }) => {
    const session = await locals.getSession()
    if (!session) {
      return fail(401, { message: "Unauthorized" })
    }

    const formData = await request.formData()
    const mapIdToDelete = formData.get("mapId")

    if (!mapIdToDelete) {
      return fail(400, { message: "Map ID is required" })
    }

    // Check if the user is the owner of the map
    const { data: mapData, error: mapError } = await locals.supabase
      .from("master_maps")
      .select("master_user_id")
      .eq("id", mapIdToDelete)
      .single()

    if (mapError || !mapData) {
      return fail(404, { message: "Map not found" })
    }

    if (mapData.master_user_id !== session.user.id) {
      return fail(403, {
        message: "You do not have permission to delete this map",
      })
    }

    // Disconnect all users from the map
    const { error: disconnectError } = await locals.supabase
      .from("profiles")
      .update({ master_map_id: null })
      .eq("master_map_id", mapIdToDelete)

    if (disconnectError) {
      console.error("Error disconnecting users:", disconnectError)
      return fail(500, { message: "Failed to disconnect users from the map" })
    }

    // Delete the map
    const { error: deleteError } = await locals.supabase
      .from("master_maps")
      .delete()
      .eq("id", mapIdToDelete)

    if (deleteError) {
      return fail(500, { message: "Failed to delete map" })
    }

    return { success: true, message: "Successfully deleted map" }
  },

  locateVehicle: async ({ locals, request }) => {
    const session = await locals.getSession()
    if (!session) {
      return fail(401, { message: "Unauthorized" })
    }

    const formData = await request.formData()
    // const userIdToKick = formData.get('userId');

    // Add logic to check if the current user has permission to kick

    return { success: true, message: "Locating user on the map" }
  },

  signout: async ({ locals: { supabase, getSession } }) => {
    const session = await getSession()

    try {
      console.log("Attempting to sign out1...")
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Error during sign-out:", error)
    } finally {
      if (typeof window !== "undefined") {
        console.log("Clearing local storage session...")
        localStorage.removeItem("supabase.auth.token")
      }
      throw redirect(303, "/")
    }
  },
}
