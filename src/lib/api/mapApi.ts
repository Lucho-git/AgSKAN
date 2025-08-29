// src/lib/api/mapApi.ts
import { supabase } from '$lib/supabaseClient';

export const mapApi = {
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

            // 🆕 NEW: Enhanced map activity data calculation (matching layout.svelte)
            const [
                markerCount,
                trailHectaresResult,
                trailDetailsResult,
                fieldCount,
                connectedProfilesResult,
                vehicleStatesResult
            ] = await Promise.all([
                // Map markers count
                supabase
                    .from("map_markers")
                    .select("id", { count: "exact" })
                    .eq("master_map_id", mapId),

                // 🆕 Trail hectares via operations join (for summary data)
                supabase
                    .from("trails")
                    .select(`
                        trail_hectares,
                        operations!inner(master_map_id)
                    `)
                    .eq("operations.master_map_id", mapId),

                // 🆕 Detailed trail metadata (excluding heavy geometry)
                supabase
                    .from("trails")
                    .select(`
                        id,
                        vehicle_id,
                        operation_id,
                        start_time,
                        end_time,
                        trail_color,
                        trail_width,
                        trail_distance,
                        trail_hectares,
                        trail_hectares_overlap,
                        trail_percentage_overlap,
                        operations!inner(
                            id,
                            name,
                            year,
                            master_map_id
                        )
                    `)
                    .eq("operations.master_map_id", mapId)
                    .order("start_time", { ascending: false }),

                // 🆕 Field boundaries count
                supabase
                    .from("fields")
                    .select("field_id", { count: "exact" })
                    .eq("map_id", mapId),

                // Enhanced profiles query with operation data
                supabase
                    .from("profiles")
                    .select(`
                        id, 
                        full_name, 
                        selected_operation_id,
                        operations!profiles_selected_operation_id_fkey (
                            id,
                            name,
                            description,
                            year
                        )
                    `)
                    .eq("master_map_id", mapId),

                // Vehicle states
                supabase
                    .from("vehicle_state")
                    .select("*")
                    .eq("master_map_id", mapId)
            ]);

            // 🆕 Calculate total trail hectares (for summary)
            const totalTrailHectares = trailHectaresResult.data?.reduce((sum, trail) => {
                return sum + (parseFloat(trail.trail_hectares) || 0)
            }, 0) || 0;

            // 🆕 Process trail details with operation info
            const trailsWithOperations = trailDetailsResult.data?.map((trail) => ({
                id: trail.id,
                vehicle_id: trail.vehicle_id,
                operation_id: trail.operation_id,
                start_time: trail.start_time,
                end_time: trail.end_time,
                trail_color: trail.trail_color || "white",
                trail_width: trail.trail_width,
                trail_distance: trail.trail_distance,
                trail_hectares: trail.trail_hectares,
                trail_hectares_overlap: trail.trail_hectares_overlap,
                trail_percentage_overlap: trail.trail_percentage_overlap,
                // Add operation info for easy display
                operation_name: trail.operations?.name || "Unknown Operation",
                operation_year: trail.operations?.year || new Date().getFullYear(),
            })) || [];

            // Process connected profiles with operation data
            const connectedProfiles = connectedProfilesResult.data || [];
            const connectedProfilesWithOperations = connectedProfiles.map((profile) => ({
                id: profile.id,
                full_name: profile.full_name,
                selected_operation_id: profile.selected_operation_id,
                current_operation: profile.operations ? {
                    id: profile.operations.id,
                    name: profile.operations.name,
                    description: profile.operations.description,
                    year: profile.operations.year,
                } : null,
                // For backward compatibility and easy access
                operation_name: profile.operations?.name || "No operation",
                operation_id: profile.operations?.id || null,
            }));

            // Filter vehicle states to only include connected users
            const connectedUserIds = connectedProfilesWithOperations.map(p => p.id);
            const filteredVehicleStates = vehicleStatesResult.data?.filter(
                vehicle => connectedUserIds.includes(vehicle.vehicle_id)
            ) || [];

            // Check if the current user is in the connected profiles
            const isUserInProfiles = connectedProfilesWithOperations.some(
                profile => profile.id === userData.id
            );

            // If not, manually add the current user
            let finalConnectedProfiles = [...connectedProfilesWithOperations];
            if (!isUserInProfiles) {
                console.log("Adding current user to connected profiles");
                finalConnectedProfiles.push({
                    id: userData.id,
                    full_name: userData.full_name,
                    selected_operation_id: selectedOperation?.id || null,
                    current_operation: selectedOperation ? {
                        id: selectedOperation.id,
                        name: selectedOperation.name,
                        description: selectedOperation.description,
                        year: selectedOperation.year,
                    } : null,
                    operation_name: selectedOperation?.name || "No operation",
                    operation_id: selectedOperation?.id || null,
                });
            }

            console.log("🆕 MapApi - Trail hectares data:", trailHectaresResult.data);
            console.log("🆕 MapApi - Total trail hectares:", totalTrailHectares);
            console.log("🆕 MapApi - Field count:", fieldCount.count);
            console.log("🆕 MapApi - Trail details:", trailsWithOperations);

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
                    // 🆕 UPDATED: Enhanced map activity with calculated metrics
                    mapActivity: {
                        marker_count: markerCount.count || 0,
                        trail_hectares: totalTrailHectares,
                        field_count: fieldCount.count || 0,
                        connected_profiles: finalConnectedProfiles,
                        vehicle_states: filteredVehicleStates
                    },
                    operations: operations || [],
                    operation: selectedOperation,
                    // 🆕 NEW: Include trails metadata for the trails store
                    trailsMetadata: trailsWithOperations
                }
            };
        } catch (error) {
            console.error("Error connecting to map:", error);
            return { success: false, message: error.message };
        }
    },

    // Also update createAndJoinMap to include the new fields
    async createAndJoinMap(mapName: string, mapId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Get user data to include in response
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
            }

            return {
                success: true,
                message: "Successfully created and joined map",
                data: {
                    mapId,
                    mapName,
                    operationId: operation.id,
                    connectedMap: {
                        id: mapId,
                        map_name: mapName,
                        master_user_id: session.session.user.id,
                        owner: userData.full_name,
                        is_owner: true,
                        masterSubscription: subscription || null,
                        is_connected: true,
                    },
                    // 🆕 UPDATED: Include all new fields for new maps
                    mapActivity: {
                        marker_count: 0,
                        trail_hectares: 0,
                        field_count: 0,
                        connected_profiles: [{
                            id: session.session.user.id,
                            full_name: userData.full_name,
                            selected_operation_id: operation.id,
                            current_operation: {
                                id: operation.id,
                                name: operation.name,
                                description: operation.description,
                                year: operation.year,
                            },
                            operation_name: operation.name,
                            operation_id: operation.id,
                        }],
                        vehicle_states: []
                    },
                    operation: {
                        id: operation.id,
                        name: operation.name,
                        year: operation.year,
                        description: operation.description,
                        master_map_id: mapId,
                    },
                    // 🆕 NEW: Empty trails metadata for new maps
                    trailsMetadata: []
                }
            };
        } catch (error) {
            console.error("Error creating map:", error);
            return { success: false, message: error.message };
        }
    },

    // ... rest of your existing functions remain the same
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

            // Fetch vehicle states
            const { data: vehicleStates, error: vehiclesError } = await supabase
                .from("vehicle_state")
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