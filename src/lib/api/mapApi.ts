// src/lib/api/mapApi.ts
import { supabase } from '$lib/supabaseClient';

export const mapApi = {
    // Connection management
    async connectToMap(mapId: string) {
        try {
            // Equivalent to the connectToMap action
            // First check if map exists
            const { data: mapData, error: mapError } = await supabase
                .from("master_maps")
                .select("id")
                .eq("id", mapId)
                .single();

            if (mapError || !mapData) {
                throw new Error("Map not found");
            }

            // Get operation data
            const { data: operationData, error: operationError } = await supabase
                .from("operations")
                .select("id")
                .eq("master_map_id", mapId)
                .limit(1)
                .single();

            if (operationError) {
                throw new Error("Failed to fetch operation data");
            }

            // Get current user data
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const { data: userData, error: userError } = await supabase
                .from("profiles")
                .select("recent_maps")
                .eq("id", session.session.user.id)
                .single();

            if (userError) {
                throw new Error("Failed to fetch user data");
            }

            // Update recent_maps
            let recentMaps = userData.recent_maps || [];
            recentMaps = recentMaps.filter((id) => id !== mapId);
            recentMaps.unshift(mapId);
            recentMaps = recentMaps.slice(0, 10);

            // Update profile
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    master_map_id: mapId,
                    recent_maps: recentMaps,
                    selected_operation_id: operationData?.id || null,
                })
                .eq("id", session.session.user.id);

            if (updateError) {
                throw new Error("Failed to connect to map");
            }

            return { success: true, message: "Successfully connected to map" };
        } catch (error) {
            console.error("Error connecting to map:", error);
            return { success: false, message: error.message };
        }
    },

    async disconnectFromMap() {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const { error } = await supabase
                .from("profiles")
                .update({ master_map_id: null })
                .eq("id", session.session.user.id);

            if (error) {
                throw new Error("Failed to disconnect from map");
            }

            return { success: true, message: "Successfully disconnected from map" };
        } catch (error) {
            console.error("Error disconnecting from map:", error);
            return { success: false, message: error.message };
        }
    },

    // Map creation and management
    async createAndJoinMap(mapName: string, mapId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Create the new map
            const { data: masterMap, error: insertError } = await supabase
                .from("master_maps")
                .insert({
                    id: mapId,
                    master_user_id: session.session.user.id,
                    map_name: mapName,
                })
                .single();

            if (insertError) {
                throw new Error("Failed to create map");
            }

            // Create default operation
            const { error: operationError } = await supabase
                .from("operations")
                .insert({
                    master_map_id: mapId,
                    name: "Farm Management",
                    year: 2024,
                    description: `Completing work around '${mapName}'s farm`,
                });

            if (operationError) {
                throw new Error("Failed to create default operation");
            }

            // Connect to the map
            const { error: updateError } = await supabase
                .from("profiles")
                .update({ master_map_id: mapId })
                .eq("id", session.session.user.id);

            if (updateError) {
                throw new Error("Failed to connect to map");
            }

            return { success: true, message: "Successfully created and joined map" };
        } catch (error) {
            console.error("Error creating map:", error);
            return { success: false, message: error.message };
        }
    },

    async renameMap(mapId: string, newMapName: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Check ownership
            const { data: mapData, error: mapError } = await supabase
                .from("master_maps")
                .select("master_user_id")
                .eq("id", mapId)
                .single();

            if (mapError || !mapData) {
                throw new Error("Map not found");
            }

            if (mapData.master_user_id !== session.session.user.id) {
                throw new Error("You do not have permission to rename this map");
            }

            // Rename the map
            const { error: updateError } = await supabase
                .from("master_maps")
                .update({ map_name: newMapName })
                .eq("id", mapId);

            if (updateError) {
                throw new Error("Failed to rename map");
            }

            return { success: true, message: "Successfully renamed map" };
        } catch (error) {
            console.error("Error renaming map:", error);
            return { success: false, message: error.message };
        }
    },

    async deleteMap(mapId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Check ownership
            const { data: mapData, error: mapError } = await supabase
                .from("master_maps")
                .select("master_user_id")
                .eq("id", mapId)
                .single();

            if (mapError || !mapData) {
                throw new Error("Map not found");
            }

            if (mapData.master_user_id !== session.session.user.id) {
                throw new Error("You do not have permission to delete this map");
            }

            // Disconnect all users
            const { error: disconnectError } = await supabase
                .from("profiles")
                .update({ master_map_id: null })
                .eq("master_map_id", mapId);

            if (disconnectError) {
                throw new Error("Failed to disconnect users from the map");
            }

            // Delete the map
            const { error: deleteError } = await supabase
                .from("master_maps")
                .delete()
                .eq("id", mapId);

            if (deleteError) {
                throw new Error("Failed to delete map");
            }

            return { success: true, message: "Successfully deleted map" };
        } catch (error) {
            console.error("Error deleting map:", error);
            return { success: false, message: error.message };
        }
    },

    // User management
    async kickUser(userId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Here you should add permission checking logic
            // For example, checking if the current user is the map owner

            const { error } = await supabase
                .from("profiles")
                .update({ master_map_id: null })
                .eq("id", userId);

            if (error) {
                throw new Error("Failed to kick user");
            }

            return { success: true, message: "Successfully kicked user from map" };
        } catch (error) {
            console.error("Error kicking user:", error);
            return { success: false, message: error.message };
        }
    },

    // Vehicle management
    async locateVehicle(vehicleId: string) {
        try {
            // Implement the logic for locating a vehicle
            // This might involve getting coordinates and triggering a map update

            return { success: true, message: "Locating vehicle on the map" };
        } catch (error) {
            console.error("Error locating vehicle:", error);
            return { success: false, message: error.message };
        }
    }
};

// User authentication
export const authApi = {
    async signOut() {
        try {
            await supabase.auth.signOut();
            if (typeof window !== "undefined") {
                localStorage.removeItem("supabase.auth.token");
            }
            window.location.href = "/";
            return { success: true };
        } catch (error) {
            console.error("Error signing out:", error);
            return { success: false, message: error.message };
        }
    }
};