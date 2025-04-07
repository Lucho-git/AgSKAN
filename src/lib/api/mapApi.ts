// src/lib/api/mapApi.ts
import { supabase } from '$lib/supabaseClient';

export const mapApi = {
    // Connection management
    // Update the connectToMap function in mapApi.ts
    async connectToMap(mapId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Check if map exists
            const { data: mapData, error: mapError } = await supabase
                .from("master_maps")
                .select("id, map_name, master_user_id")
                .eq("id", mapId)
                .single();

            if (mapError || !mapData) {
                throw new Error("Map not found");
            }

            // Get operation data
            const { data: operations, error: operationError } = await supabase
                .from("operations")
                .select("*")
                .eq("master_map_id", mapId)
                .order("year", { ascending: false });

            if (operationError) {
                console.error("Error fetching operations:", operationError);
            }

            // Get user data to update recent maps
            const { data: userData, error: userError } = await supabase
                .from("profiles")
                .select("recent_maps, full_name, id")
                .eq("id", session.session.user.id)
                .single();

            if (userError) {
                console.error("Error fetching user data:", userError);
                throw new Error("Failed to fetch user data");
            }

            // Update recent_maps
            let recentMaps = userData.recent_maps || [];
            recentMaps = recentMaps.filter((id) => id !== mapId);
            recentMaps.unshift(mapId);
            recentMaps = recentMaps.slice(0, 10);

            // Get map owner info
            const { data: ownerData, error: ownerError } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", mapData.master_user_id)
                .single();

            if (ownerError) {
                console.error("Error fetching owner data:", ownerError);
            }

            // Get master subscription
            const { data: masterSubscription, error: subscriptionError } = await supabase
                .from("user_subscriptions")
                .select("*")
                .eq("user_id", mapData.master_user_id)
                .single();

            if (subscriptionError && subscriptionError.code !== 'PGRST116') {
                console.error("Error fetching subscription:", subscriptionError);
            }

            // Select the first operation if available
            const selectedOperation = operations && operations.length > 0 ? operations[0] : null;

            // Update profile with map connection first
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    master_map_id: mapId,
                    recent_maps: recentMaps,
                    selected_operation_id: selectedOperation?.id || null
                })
                .eq("id", session.session.user.id);

            if (updateError) {
                console.error("Error updating profile:", updateError);
                throw new Error("Failed to connect to map");
            }

            // Now get map activity data AFTER connecting to the map
            // Fetch connected profiles (should now include the current user)
            const { data: connectedProfiles, error: profilesError } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("master_map_id", mapId);

            if (profilesError) {
                console.error("Error fetching connected profiles:", profilesError);
            }

            // Fetch marker count
            const { count: markerCount, error: markerError } = await supabase
                .from("map_markers")
                .select("id", { count: 'exact', head: true })
                .eq("master_map_id", mapId);

            if (markerError) {
                console.error("Error fetching marker count:", markerError);
            }

            // Fetch trail count
            const { count: trailCount, error: trailError } = await supabase
                .from("trail_data")
                .select("id", { count: 'exact', head: true })
                .eq("master_map_id", mapId);

            if (trailError) {
                console.error("Error fetching trail count:", trailError);
            }

            // Fetch vehicle states with the EXACT SAME QUERY used in layout.svelte
            const { data: vehicleStates, error: vehiclesError } = await supabase
                .from("vehicle_state")
                .select("*") // This needs to be the same as your layout.svelte
                .eq("master_map_id", mapId)
                .in(
                    "vehicle_id",
                    connectedProfiles?.map((profile) => profile.id) || []
                );

            if (vehiclesError) {
                console.error("Error fetching vehicle states:", vehiclesError);
            }

            // Check if the current user is in the connected profiles
            const isUserInProfiles = (connectedProfiles || []).some(
                profile => profile.id === userData.id
            );

            // If not, manually add the current user
            let finalConnectedProfiles = [...(connectedProfiles || [])];
            if (!isUserInProfiles) {
                console.log("Adding current user to connected profiles");
                finalConnectedProfiles.push({
                    id: userData.id,
                    full_name: userData.full_name
                });
            }

            return {
                success: true,
                message: "Successfully connected to map",
                data: {
                    mapId,
                    mapName: mapData.map_name,
                    connectedMap: {
                        id: mapId,
                        map_name: mapData.map_name,
                        master_user_id: mapData.master_user_id,
                        owner: ownerData?.full_name || "Unknown",
                        is_owner: mapData.master_user_id === session.session.user.id,
                        masterSubscription: masterSubscription || null,
                        is_connected: true
                    },
                    mapActivity: {
                        marker_count: markerCount || 0,
                        trail_count: trailCount || 0,
                        connected_profiles: finalConnectedProfiles,
                        vehicle_states: vehicleStates || []
                    },
                    operations: operations || [],
                    operation: selectedOperation
                }
            };
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

            // Get user data to include in response - removed subscription field
            const { data: userData, error: userError } = await supabase
                .from("profiles")
                .select("id, full_name, recent_maps")
                .eq("id", session.session.user.id)
                .single();

            if (userError) {
                console.error("Error fetching user data:", userError);
                throw new Error("Failed to fetch user data");
            }

            // Create the new map
            const { error: insertError } = await supabase
                .from("master_maps")
                .insert({
                    id: mapId,
                    master_user_id: session.session.user.id,
                    map_name: mapName,
                });

            if (insertError) {
                console.error("Error creating map:", insertError);
                throw new Error("Failed to create map");
            }

            // Create default operation
            const { data: operation, error: operationError } = await supabase
                .from("operations")
                .insert({
                    master_map_id: mapId,
                    name: "Farm Management",
                    year: 2024,
                    description: `Completing work around '${mapName}'s farm`,
                })
                .select()
                .single();

            if (operationError) {
                console.error("Error creating operation:", operationError);
                throw new Error("Failed to create default operation");
            }

            // Update recent_maps
            let recentMaps = userData.recent_maps || [];
            recentMaps = recentMaps.filter((id) => id !== mapId);
            recentMaps.unshift(mapId);
            recentMaps = recentMaps.slice(0, 10);

            // Connect to the map and update profile with default operation and recent maps
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    master_map_id: mapId,
                    recent_maps: recentMaps,
                    selected_operation_id: operation.id
                })
                .eq("id", session.session.user.id);

            if (updateError) {
                console.error("Error updating profile:", updateError);
                throw new Error("Failed to connect to map");
            }

            // Fetch user's subscription for response
            const { data: subscription, error: subscriptionError } = await supabase
                .from("user_subscriptions")
                .select("*")
                .eq("user_id", session.session.user.id)
                .single();

            if (subscriptionError && subscriptionError.code !== 'PGRST116') {
                console.error("Error fetching subscription:", subscriptionError);
                // Continue without subscription data if there's an error
            }

            return {
                success: true,
                message: "Successfully created and joined map",
                data: {
                    mapId,
                    mapName,
                    operationId: operation.id,
                    // Include connected map data structure
                    connectedMap: {
                        id: mapId,
                        map_name: mapName,
                        master_user_id: session.session.user.id,
                        owner: userData.full_name,
                        is_owner: true,
                        masterSubscription: subscription || null,
                        is_connected: true,
                    },
                    // Include map activity data structure
                    mapActivity: {
                        marker_count: 0,
                        trail_count: 0,
                        connected_profiles: [{
                            id: session.session.user.id,
                            full_name: userData.full_name,
                            master_map_id: mapId
                        }],
                        vehicle_states: []
                    },
                    // Include operation data
                    operation: {
                        id: operation.id,
                        name: operation.name,
                        year: operation.year,
                        description: operation.description,
                        master_map_id: mapId,
                    }
                }
            };
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

    async getMapActivity(mapId: string) {
        try {
            // Fetch connected profiles
            const { data: connectedProfiles, error: profilesError } = await supabase
                .from("profiles")
                .select("id, full_name")
                .eq("master_map_id", mapId);

            if (profilesError) {
                throw new Error("Failed to fetch connected profiles");
            }

            // Fetch marker count
            const { count: markerCount, error: markerError } = await supabase
                .from("map_markers") // Use your actual table name
                .select("id", { count: 'exact', head: true })
                .eq("master_map_id", mapId);

            if (markerError) {
                console.error("Error fetching marker count:", markerError);
            }

            // Fetch trail count
            const { count: trailCount, error: trailError } = await supabase
                .from("trail_data") // Use your actual table name
                .select("id", { count: 'exact', head: true })
                .eq("master_map_id", mapId);

            if (trailError) {
                console.error("Error fetching trail count:", trailError);
            }

            // Fetch vehicle states
            const { data: vehicleStates, error: vehiclesError } = await supabase
                .from("vehicle_state") // Note: Using "vehicle_state" as in your layout.svelte
                .select("*")
                .eq("master_map_id", mapId)
                .in(
                    "vehicle_id",
                    connectedProfiles?.map((profile) => profile.id) || []
                );

            if (vehiclesError) {
                console.error("Error fetching vehicle states:", vehiclesError);
            }

            return {
                success: true,
                data: {
                    marker_count: markerCount || 0,
                    trail_count: trailCount || 0,
                    connected_profiles: connectedProfiles || [],
                    vehicle_states: vehicleStates || []
                }
            };
        } catch (error) {
            console.error("Error fetching map activity:", error);
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