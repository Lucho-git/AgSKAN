// src/lib/api/trailsApi.ts
import { supabase } from '$lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

const TRAIL_DATA_RETENTION_DAYS = 300; // Same as server-side

/**
 * Groups an array of objects by a specified property
 */
function groupBy(array: any[], property: string) {
    return array.reduce((acc, obj) => {
        const key = obj[property];
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(obj);
        return acc;
    }, {});
}

interface Point {
    longitude: number;
    latitude: number;
    timestamp: number;
}

interface TrailTimeoutConfig {
    timeoutMinutes: number;
    closeStaleTrails: boolean;
    notifyOnClose: boolean;
}

const DEFAULT_CONFIG: TrailTimeoutConfig = {
    timeoutMinutes: 10 * 60, // 10 hours in minutes
    closeStaleTrails: true,
    notifyOnClose: true,
};

/**
 * Calculate perpendicular distance from a point to a line
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.longitude - lineStart.longitude;
    const dy = lineEnd.latitude - lineStart.latitude;

    // If it's a point, not a line, return distance between points
    if (dx === 0 && dy === 0) {
        const diffX = point.longitude - lineStart.longitude;
        const diffY = point.latitude - lineStart.latitude;
        return Math.sqrt(diffX * diffX + diffY * diffY);
    }

    // Calculate perpendicular distance
    const numerator = Math.abs(
        dy * point.longitude - dx * point.latitude +
        lineEnd.longitude * lineStart.latitude -
        lineEnd.latitude * lineStart.longitude
    );
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return numerator / denominator;
}

/**
 * Simplify a path using Douglas-Peucker algorithm
 */
function simplifyPath(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2) {
        return points;
    }

    // Find the point with the maximum distance
    let maxDistance = 0;
    let index = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const distance = perpendicularDistance(points[i], start, end);
        if (distance > maxDistance) {
            maxDistance = distance;
            index = i;
        }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
        // Recursive call
        const firstLine = simplifyPath(points.slice(0, index + 1), tolerance);
        const secondLine = simplifyPath(points.slice(index), tolerance);

        // Concat the two simplified lines
        return [...firstLine.slice(0, -1), ...secondLine];
    } else {
        return [start, end];
    }
}

/**
 * Close a trail with path data using fast closure
 */
async function closeTrailWithPath(
    trail_id: string,
    endTime: string,
    path?: Point[],
) {
    if (!path || path.length === 0) {
        // If no path is provided, just update the end time
        const result = await supabase.rpc("close_trail_fast", {
            trail_id_param: trail_id,
            end_time_param: endTime,
            path_param: null,
            detailed_path_param: null
        });

        return { data: result.data, error: result.error };
    }

    // Format the detailed path with timestamps (LINESTRING M format)
    const detailedLineString = path
        .map((point) => `${point.longitude} ${point.latitude} ${point.timestamp}`)
        .join(",");
    const detailedPathString = `SRID=4326;LINESTRING M(${detailedLineString})`;

    // Create a simplified path for display using Douglas-Peucker algorithm
    const simplifiedPath = simplifyPath(path, 0.000005);
    const simplifiedLineString = simplifiedPath
        .map((point) => `${point.longitude} ${point.latitude}`)
        .join(",");
    const pathString = `SRID=4326;LINESTRING(${simplifiedLineString})`;

    console.log(`Trail ${trail_id}: ${path.length.toLocaleString()} points → ${simplifiedPath.length.toLocaleString()} simplified (${Math.round((1 - simplifiedPath.length / path.length) * 100)}% reduction)`);

    try {
        console.log(`Closing trail ${trail_id} with fast closure (stores paths, no calculations)...`);

        // Use close_trail_fast - stores paths and deletes points, but doesn't calculate metrics
        const { data, error } = await supabase.rpc("close_trail_fast", {
            trail_id_param: trail_id,
            end_time_param: endTime,
            path_param: pathString,
            detailed_path_param: detailedPathString
        });

        if (error) {
            console.error(`❌ Trail ${trail_id}: Fast closure failed:`, error);
            throw error;
        }

        if (!data?.success) {
            console.error(`❌ Trail ${trail_id}: Fast closure returned error:`, data?.error);
            throw new Error(data?.error || 'Fast closure failed');
        }

        console.log(`✅ Trail ${trail_id}: Successfully closed (paths stored, points deleted)`);
        console.log(`   Attempting metrics calculation in background...`);

        // Attempt metrics calculation in background (non-blocking, failures are OK)
        supabase.rpc('calculate_trail_metrics', { trail_id_param: trail_id })
            .then(({ data: metricsResult, error: metricsError }) => {
                if (metricsError || !metricsResult?.success) {
                    console.warn(`⚠️  Trail ${trail_id}: Metrics calculation failed (will calculate later)`);
                    if (metricsError) {
                        console.warn(`    Error:`, metricsError.message);
                    } else if (metricsResult?.error) {
                        console.warn(`    Error:`, metricsResult.error);
                    }
                } else {
                    console.log(`✅ Trail ${trail_id}: Metrics calculated successfully`);
                    if (metricsResult.metrics) {
                        console.log(`   Distance: ${metricsResult.metrics.trail_distance}m`);
                        console.log(`   Area: ${metricsResult.metrics.trail_hectares} hectares`);
                        console.log(`   Overlap: ${metricsResult.metrics.trail_percentage_overlap}%`);
                    }
                }
            })
            .catch(err => {
                console.warn(`⚠️  Trail ${trail_id}: Metrics calculation error (will calculate later)`, err.message);
            });

        return { data, error: null };

    } catch (error) {
        console.error(`❌ Error closing trail ${trail_id}:`, error);
        throw error;
    }
}

/**
 * Check if a trail is fresh (has recent activity)
 */
async function isTrailFresh(
    trail_id: string,
    timeoutMinutes: number,
): Promise<{ isFresh: boolean; lastTimestamp?: string; lastPoint?: any }> {
    console.log(`\nChecking freshness for trail ${trail_id}`);
    console.log(`Timeout threshold: ${timeoutMinutes} minutes`);

    const { data: lastPoint, error } = await supabase
        .from("trail_stream")
        .select("*")
        .eq("trail_id", trail_id)
        .order("timestamp", { ascending: false })
        .limit(1);

    const currentTime = new Date();
    let lastActivityTime: Date;
    let lastTimestamp: string;

    if (error || !lastPoint?.[0]?.timestamp) {
        // If no points exist, get the trail's start time
        const { data: trail } = await supabase
            .from("trails")
            .select("start_time")
            .eq("id", trail_id)
            .single();

        lastTimestamp = trail?.start_time || currentTime.toISOString();
        lastActivityTime = new Date(lastTimestamp);
        console.log("No points found, using trail start time as last activity");
    } else {
        lastTimestamp = lastPoint[0].timestamp;
        lastActivityTime = new Date(lastTimestamp);
        console.log("Using last point timestamp as last activity");
    }

    const minutesSinceLastPoint =
        (currentTime.getTime() - lastActivityTime.getTime()) / (1000 * 60);

    console.log(`Current time: ${currentTime.toISOString()}`);
    console.log(`Last activity time: ${lastActivityTime.toISOString()}`);
    console.log(
        `Minutes since last activity: ${minutesSinceLastPoint.toFixed(2)}`,
    );
    console.log(`Is fresh: ${minutesSinceLastPoint <= timeoutMinutes}\n`);

    return {
        isFresh: minutesSinceLastPoint <= timeoutMinutes,
        lastTimestamp,
        lastPoint: lastPoint?.[0],
    };
}

/**
 * Process and close a trail
 */
async function processAndCloseTrail(trail_id: string) {
    console.log(`Processing and closing trail ${trail_id}`);

    const { data: trailPoints, error: pointsError } = await supabase
        .from("trail_stream")
        .select("*")
        .eq("trail_id", trail_id)
        .order("timestamp", { ascending: true });

    if (pointsError) {
        throw new Error(
            `Error fetching points for trail ${trail_id}: ${pointsError.message}`,
        );
    }

    if (!trailPoints || trailPoints.length < 3) {
        console.log(
            `Trail ${trail_id} has insufficient points (${trailPoints?.length || 0}), deleting`,
        );
        await supabase.from("trail_stream").delete().eq("trail_id", trail_id);
        await supabase.from("trails").delete().eq("id", trail_id);
        return { deleted: true, reason: "insufficient_points" };
    }

    // Extract path points from trail data
    const pathPoints = trailPoints.map((point) => ({
        longitude: point.coordinate.coordinates[0],
        latitude: point.coordinate.coordinates[1],
        timestamp: new Date(point.timestamp).getTime(),
    }));

    // Trail has enough points, close it with the last timestamp and path data
    const trailEndTime = trailPoints[trailPoints.length - 1].timestamp;
    const result = await closeTrailWithPath(trail_id, trailEndTime, pathPoints);

    if (result.error) {
        throw new Error(`Failed to close trail: ${result.error.message}`);
    }

    return { deleted: false, closed: true, message: "Trail closed" };
}

/**
 * Handle open trails for a vehicle
 */
async function handleOpenTrails(
    vehicle_id: string,
    operation_id?: string,
    config: Partial<TrailTimeoutConfig> = {},
) {
    console.log(`\nHandling open trails for vehicle ${vehicle_id}`);
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    let query = supabase
        .from("trails")
        .select("*")
        .eq("vehicle_id", vehicle_id)
        .is("end_time", null)
        .order("start_time", { ascending: false });

    if (operation_id) {
        query = query.eq("operation_id", operation_id);
    }

    const { data: openTrails, error } = await query;

    if (error) {
        throw new Error(`Error fetching open trails: ${error.message}`);
    }

    if (!openTrails || openTrails.length === 0) {
        console.log("No open trails found");
        return { mostRecentTrail: null, processedTrails: [] };
    }

    console.log(`Found ${openTrails.length} open trails`);
    let [mostRecentTrail, ...olderTrails] = openTrails;
    const processedTrails = [];

    // Check freshness of most recent trail
    const { isFresh, lastTimestamp, lastPoint } = await isTrailFresh(
        mostRecentTrail.id,
        finalConfig.timeoutMinutes,
    );

    // If trail is stale and we should close stale trails
    if (!isFresh && finalConfig.closeStaleTrails) {
        console.log(`Trail ${mostRecentTrail.id} is stale, processing for closure`);
        const result = await processAndCloseTrail(mostRecentTrail.id);
        processedTrails.push({
            trail_id: mostRecentTrail.id,
            result,
            reason: `Trail inactive for more than ${finalConfig.timeoutMinutes} minutes`,
            last_activity: lastTimestamp,
        });
        mostRecentTrail = null;
    } else if (isFresh) {
        console.log(`Trail ${mostRecentTrail.id} is still active`);
    }

    // Process older trails
    for (const trail of olderTrails) {
        console.log(`\nProcessing older trail ${trail.id}`);
        const { lastTimestamp: oldTrailLastTimestamp } = await isTrailFresh(
            trail.id,
            finalConfig.timeoutMinutes,
        );

        const result = await processAndCloseTrail(trail.id);
        processedTrails.push({
            trail_id: trail.id,
            result,
            reason: "older_trail",
            last_activity: oldTrailLastTimestamp,
        });
    }

    return {
        mostRecentTrail,
        processedTrails,
        config: finalConfig,
        staleTrailClosed: !isFresh && finalConfig.closeStaleTrails,
        lastActivity: lastTimestamp,
    };
}

export const trailsApi = {
    /**
     * Close a trail
     */
    async closeTrail(trailData: {
        trail_id: string;
        vehicle_id: string;
        operation_id: string;
        path: Array<{
            latitude: number;
            longitude: number;
            timestamp: number;
        }>;
        trail_color: string;
        trail_width: number;
    }) {
        try {
            console.log(`Closing trail ${trailData.trail_id}`);

            // Get user session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                console.error("No authenticated user session");
                throw new Error("Authentication required");
            }

            // Transform path data for closeTrailWithPath
            const pathForClosing = trailData.path.map(point => ({
                longitude: point.longitude,
                latitude: point.latitude,
                timestamp: point.timestamp
            }));

            // Use the updated closeTrailWithPath function
            const { error: closeError } = await closeTrailWithPath(
                trailData.trail_id,
                new Date().toISOString(),
                pathForClosing
            );

            if (closeError) {
                console.error("Error closing trail:", closeError);
                throw new Error(`Failed to close trail: ${closeError.message}`);
            }

            // Get the updated trail data to return
            const { data: trailResult, error: getError } = await supabase
                .from('trails')
                .select('*')
                .eq('id', trailData.trail_id)
                .single();

            if (getError) {
                console.error("Error fetching updated trail:", getError);
                // Don't throw here - the close operation likely succeeded
            }

            return {
                success: true,
                trail: trailResult || {
                    id: trailData.trail_id,
                    vehicle_id: trailData.vehicle_id,
                    operation_id: trailData.operation_id,
                    trail_color: trailData.trail_color,
                    trail_width: trailData.trail_width,
                    // We don't have the start/end times without the DB query
                }
            };

        } catch (error) {
            console.error("Error in closeTrail:", error);
            return {
                error: true,
                message: error.message || "Failed to close trail"
            };
        }
    },


    /**
     * Load trail data for a specific master map
     */
    async loadMapTrails(masterMapId: string) {
        try {
            console.log("Loading trail data for master map ID:", masterMapId);

            // Get user session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                console.error("No authenticated user session");
                throw new Error("Authentication required");
            }

            const userId = sessionData.session.user.id;

            if (!masterMapId) {
                console.error("No master map ID provided");
                throw new Error("Master map ID is required");
            }

            // Calculate retention timestamp in milliseconds
            const retentionTimestamp =
                Date.now() - TRAIL_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

            console.log("Fetching user trail data...");

            // User trail data query
            const { data: userTrailData, error: userError } = await supabase
                .from("trail_data")
                .select("*")
                .eq("master_map_id", masterMapId)
                .eq("vehicle_id", userId)
                .gte("timestamp", retentionTimestamp)
                .order("timestamp", { ascending: true });

            if (userError) {
                console.error("Error fetching user trail data:", userError);
                throw userError;
            }

            console.log(`Retrieved ${userTrailData?.length || 0} user trail data points`);

            // Other users' trail data query using RPC
            console.log("Fetching other users' trail data...");
            const { data: otherTrailData, error: otherError } = await supabase
                .rpc("get_other_trail_data", {
                    p_master_map_id: masterMapId,
                    p_user_id: userId,
                    p_retention_timestamp: retentionTimestamp,
                });

            if (otherError) {
                console.error("Error fetching other trail data:", otherError);
                throw otherError;
            }

            console.log(`Retrieved ${otherTrailData?.length || 0} other trail data points`);

            // Group data by vehicle_id
            const groupedUserTrailData = groupBy(userTrailData || [], "vehicle_id");
            const groupedOtherTrailData = groupBy(otherTrailData || [], "vehicle_id");

            return {
                user: groupedUserTrailData,
                other: groupedOtherTrailData,
            };

        } catch (error) {
            console.error("Error in loadMapTrails:", error);
            // Return empty data in case of error
            return {
                error: true,
                message: error.message || "An error occurred while loading trail data",
                user: {},
                other: {}
            };
        }
    },

    /**
     * Check for open trails for a specific vehicle
     */
    async checkOpenTrails(vehicleId: string, timeoutMinutes?: number) {
        try {
            console.log(`Checking open trails for vehicle ${vehicleId}`);

            // Get user session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                console.error("No authenticated user session");
                throw new Error("Authentication required");
            }

            if (!vehicleId) {
                throw new Error("Missing vehicle_id");
            }

            // Use our handleOpenTrails function
            const result = await handleOpenTrails(
                vehicleId,
                undefined,
                {
                    timeoutMinutes: timeoutMinutes || 30,
                    closeStaleTrails: true,
                    notifyOnClose: true,
                },
            );

            const { mostRecentTrail, processedTrails, staleTrailClosed, lastActivity } = result;

            // If any trail was closed due to being stale, consider all trails closed
            if (staleTrailClosed) {
                console.log("Trail was closed due to being stale, considering all trails inactive");
                return {
                    openTrail: null,
                    trailData: null,
                    processedTrails,
                    staleTrailClosed,
                    lastActivity,
                };
            }

            // Only proceed with fetching trail data if we have an active trail AND no stale closure occurred
            if (mostRecentTrail && !staleTrailClosed) {
                console.log(`Fetching data for active trail ${mostRecentTrail.id}`);

                const { data: trailData, error: trailDataError } = await supabase
                    .from("trail_stream")
                    .select("coordinate, timestamp")
                    .eq("trail_id", mostRecentTrail.id)
                    .order("timestamp", { ascending: true });

                if (trailDataError) {
                    throw new Error(`Failed to fetch trail data: ${trailDataError.message}`);
                }

                const transformedTrailData = trailData.map((point) => ({
                    coordinates: {
                        latitude: point.coordinate.coordinates[1],
                        longitude: point.coordinate.coordinates[0],
                    },
                    timestamp: new Date(point.timestamp).getTime(),
                }));

                return {
                    openTrail: mostRecentTrail,
                    trailData: transformedTrailData,
                    processedTrails,
                    staleTrailClosed,
                    lastActivity,
                };
            }

            // No active trails found
            console.log("No active trails found");
            return {
                openTrail: null,
                trailData: null,
                processedTrails,
                staleTrailClosed,
                lastActivity,
            };

        } catch (error) {
            console.error("Error in checkOpenTrails:", error);
            return {
                error: true,
                message: error.message || "An unexpected error occurred while checking open trails"
            };
        }
    },

    /**
     * Check for other active trails in an operation
     */
    async checkOtherActiveTrails(operationId: string, currentVehicleId: string) {
        try {
            console.log(`Checking other active trails for operation ${operationId}`);

            // Get user session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                console.error("No authenticated user session");
                throw new Error("Authentication required");
            }

            if (!operationId || !currentVehicleId) {
                throw new Error("Missing required parameters");
            }

            // Query for open trails in this operation (except current vehicle)
            const { data: openTrails, error: trailsError } = await supabase
                .from("trails")
                .select(
                    `
                    id,
                    vehicle_id,
                    operation_id,
                    start_time,
                    end_time,
                    trail_color,
                    trail_width
                    `
                )
                .eq("operation_id", operationId)
                .neq("vehicle_id", currentVehicleId)
                .is("end_time", null)
                .order("start_time", { ascending: false });

            if (trailsError) throw trailsError;

            const trailsByVehicle = openTrails.reduce((acc, trail) => {
                if (!acc[trail.vehicle_id]) {
                    acc[trail.vehicle_id] = [];
                }
                acc[trail.vehicle_id].push(trail);
                return acc;
            }, {});

            const errors: string[] = [];
            const activeTrails = [];

            for (const [vehicleId, trails] of Object.entries(trailsByVehicle)) {
                if (trails.length === 0) continue;

                const [mostRecentTrail, ...olderTrails] = trails;

                if (olderTrails.length > 0) {
                    console.log(
                        `Found ${olderTrails.length} additional open trails for vehicle ${vehicleId}`
                    );

                    for (const trail of olderTrails) {
                        console.log(
                            `Processing trail ${trail.id} for vehicle ${vehicleId} (started at ${trail.start_time})`
                        );

                        try {
                            // Use our processAndCloseTrail function
                            const result = await processAndCloseTrail(trail.id);

                            if (result.deleted) {
                                console.log(`Deleted trail ${trail.id} - ${result.reason}`);
                            } else {
                                console.log(`Successfully closed trail ${trail.id}`);
                            }
                        } catch (error) {
                            const errorMsg = `Error processing trail ${trail.id}: ${error.message}`;
                            console.error(errorMsg);
                            errors.push(errorMsg);
                        }
                    }
                }

                try {
                    const { data: trailData, error: trailDataError } = await supabase
                        .from("trail_stream")
                        .select("coordinate, timestamp")
                        .eq("trail_id", mostRecentTrail.id)
                        .order("timestamp", { ascending: true });

                    if (trailDataError) {
                        if (trailDataError.code === "57014") {
                            errors.push(
                                `Timeout error while loading trail data for vehicle ${vehicleId}`
                            );
                        } else {
                            errors.push(
                                `Error loading trail data for vehicle ${vehicleId}: ${trailDataError.message}`
                            );
                        }
                        continue;
                    }

                    const transformedTrailData = trailData.map((point) => ({
                        coordinates: {
                            latitude: point.coordinate.coordinates[1],
                            longitude: point.coordinate.coordinates[0],
                        },
                        timestamp: new Date(point.timestamp).getTime(),
                    }));

                    activeTrails.push({
                        ...mostRecentTrail,
                        trailData: transformedTrailData,
                    });
                } catch (error) {
                    errors.push(
                        `Error processing trail data for vehicle ${vehicleId}: ${error.message}`
                    );
                }
            }

            return {
                activeTrails,
                errors: errors.length > 0 ? errors : undefined,
            };

        } catch (error) {
            console.error("Error in checkOtherActiveTrails:", error);
            return {
                error: true,
                message: error.message || "Failed to fetch active trails",
                code: error?.code
            };
        }
    },

    /**
     * Delete a trail
     */
    async deleteTrail(trailId: string) {
        try {
            console.log(`Deleting trail ${trailId}`);

            // Get user session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                console.error("No authenticated user session");
                throw new Error("Authentication required");
            }

            // First delete all points from trail_stream
            const { error: deletePointsError } = await supabase
                .from('trail_stream')
                .delete()
                .eq('trail_id', trailId);

            if (deletePointsError) {
                console.error("Error deleting trail points:", deletePointsError);
                // Continue anyway to try to delete the trail
            }

            // Then delete the trail itself
            const { error: deleteTrailError } = await supabase
                .from('trails')
                .delete()
                .eq('id', trailId);

            if (deleteTrailError) {
                console.error("Error deleting trail:", deleteTrailError);
                throw new Error(`Failed to delete trail: ${deleteTrailError.message}`);
            }

            return { success: true, message: "Trail deleted" };

        } catch (error) {
            console.error("Error in deleteTrail:", error);
            return {
                error: true,
                message: error.message || "Failed to delete trail"
            };
        }
    },

    /**
     * Create a new trail
     */
    async openNewTrail(vehicleId: string, operationId: string, vehicleInfo: any) {
        try {
            console.log(`Creating new trail for vehicle ${vehicleId} in operation ${operationId}`);

            // Get user session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                console.error("No authenticated user session");
                throw new Error("Authentication required");
            }

            // Generate UUID for the new trail
            const trailId = uuidv4();

            // Create the new trail
            const newTrail = {
                id: trailId,
                vehicle_id: vehicleId,
                operation_id: operationId,
                start_time: new Date().toISOString(),
                trail_color: vehicleInfo.vehicle_marker?.bodyColor || "#000000", // Default to black
                trail_width: vehicleInfo.vehicle_marker?.swath || 11, // Default width
            };

            const { data, error } = await supabase
                .from("trails")
                .insert([newTrail])
                .select("*");

            if (error) {
                console.error("Error creating new trail:", error);
                throw new Error(`Failed to create new trail: ${error.message}`);
            }

            if (!data || data.length === 0) {
                throw new Error("No trail data returned after creation");
            }

            return { trail: data[0] };

        } catch (error) {
            console.error("Error in openNewTrail:", error);
            return {
                error: true,
                message: error.message || "Failed to create new trail"
            };
        }
    },

    /**
     * Save coordinates for a trail
     */
    async saveCoordinates(operationId: string, trailId: string, coordinatesBatch: Array<{
        coordinates: {
            latitude: number;
            longitude: number;
        };
        timestamp: number;
    }>) {
        try {
            //console.log(`Saving ${coordinatesBatch.length} coordinates for trail ${trailId}`);

            // Get user session
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                console.error("No authenticated user session");
                throw new Error("Authentication required");
            }

            if (!trailId || !coordinatesBatch || coordinatesBatch.length === 0) {
                throw new Error("Missing required fields");
            }

            // Prepare the batch of coordinates for insertion
            const coordinatesForInsert = coordinatesBatch.map(
                ({ coordinates, timestamp }) => ({
                    operation_id: operationId,
                    trail_id: trailId,
                    coordinate: `POINT(${coordinates.longitude} ${coordinates.latitude})`,
                    timestamp: new Date(timestamp).toISOString(),
                })
            );

            const { data, error } = await supabase
                .from("trail_stream")
                .insert(coordinatesForInsert)
                .select();

            if (error) {
                console.error("Error saving coordinates:", error);
                throw new Error(`Failed to save coordinates: ${error.message}`);
            }

            //console.log(`Successfully saved ${data.length} coordinates`);
            return { coordinates: data };

        } catch (error) {
            console.error("Error in saveCoordinates:", error);
            return {
                error: true,
                message: error.message || "Failed to save coordinates"
            };
        }
    }

};
