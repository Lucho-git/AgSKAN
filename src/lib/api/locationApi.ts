// src/lib/api/locationApi.ts
import { supabase } from '$lib/supabaseClient';

function calculateBoundingBox(
    coordinates: number[][][],
): [number, number, number, number] {
    let minLon = Infinity,
        maxLon = -Infinity,
        minLat = Infinity,
        maxLat = -Infinity

    coordinates.forEach((polygon) => {
        polygon.forEach((ring) => {
            ring.forEach(([lon, lat]) => {
                minLon = Math.min(minLon, lon)
                maxLon = Math.max(maxLon, lon)
                minLat = Math.min(minLat, lat)
                maxLat = Math.max(maxLat, lat)
            })
        })
    })

    return [minLon, minLat, maxLon, maxLat]
}

export const locationApi = {
    async getLocation(objectType: string, objectId: string) {
        try {
            // Get the current session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = sessionData.session.user.id;

            // Get the user's master map ID
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("master_map_id")
                .eq("id", userId)
                .single();

            if (profileError) {
                console.error("Error fetching profile:", profileError);
                throw new Error(`Failed to fetch profile: ${profileError.message}`);
            }

            const masterMapId = profileData.master_map_id;
            if (!masterMapId) {
                throw new Error("No master map associated with user");
            }

            let location;
            let type;

            switch (objectType) {
                case "field":
                    const { data: fieldData, error: fieldError } = await supabase
                        .from("fields")
                        .select("boundary")
                        .eq("map_id", masterMapId)
                        .eq("field_id", objectId)
                        .single();

                    if (fieldError) {
                        console.error("Error fetching field:", fieldError);
                        throw new Error(`Failed to fetch field: ${fieldError.message}`);
                    }

                    const boundary = fieldData.boundary;

                    if (boundary &&
                        (boundary.type === "MultiPolygon" || boundary.type === "Polygon")) {
                        const coordinates =
                            boundary.type === "MultiPolygon"
                                ? boundary.coordinates
                                : [boundary.coordinates];
                        location = calculateBoundingBox(coordinates);
                        type = "boundingBox";
                    } else {
                        throw new Error("Invalid geometry type");
                    }
                    break;

                case "vehicle":
                    const { data: vehicleData, error: vehicleError } = await supabase
                        .from("vehicle_state")
                        .select("coordinates")
                        .eq("master_map_id", masterMapId)
                        .eq("vehicle_id", objectId)
                        .single();

                    if (vehicleError) {
                        console.error("Error fetching vehicle:", vehicleError);
                        throw new Error(`Failed to fetch vehicle: ${vehicleError.message}`);
                    }

                    if (!vehicleData || !vehicleData.coordinates) {
                        throw new Error("Vehicle location not found");
                    }

                    // Parse the coordinates string
                    const coordinatesMatch = vehicleData.coordinates.match(
                        /\(([-\d.]+),([-\d.]+)\)/,
                    );

                    if (!coordinatesMatch) {
                        throw new Error("Invalid coordinate format");
                    }

                    // Extract longitude and latitude
                    const longitude = parseFloat(coordinatesMatch[1]);
                    const latitude = parseFloat(coordinatesMatch[2]);

                    location = [longitude, latitude];
                    type = "coordinate";
                    break;

                case "marker":
                    // Implement marker location fetching
                    location = [0, 0]; // Example coordinate
                    type = "coordinate";
                    break;

                default:
                    throw new Error("Invalid object type");
            }

            if (!location) {
                throw new Error("Location could not be calculated");
            }

            return {
                success: true,
                location,
                type
            };

        } catch (error) {
            console.error("Error getting location:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};