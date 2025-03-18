// src/routes/api/location/+server.ts

import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

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

export const GET: RequestHandler = async ({ locals, url, request }) => {
    try {
        // Try to get from Authorization header (client-side)
        let session = null;
        let userId = null;

        const authHeader = request.headers.get('Authorization')
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7)

            // Verify the token using Supabase
            try {
                const { data, error } = await locals.supabase.auth.getUser(token)
                if (!error && data?.user) {
                    session = {
                        user: data.user
                    }
                    userId = data.user.id
                }
            } catch (e) {
                console.error("Error verifying token:", e)
                // Token verification failed
            }
        }

        // Fallback to server-side session if needed
        if (!session) {
            session = await locals.getSession()
            userId = session?.user?.id
        }

        if (!session || !userId) {
            console.error("No valid session found")
            return json({ error: "Unauthorized" }, { status: 401 })
        }

        const objectType = url.searchParams.get("type")
        const objectId = url.searchParams.get("id")

        if (!objectType || !objectId) {
            return json({ error: "Missing type or id parameter" }, { status: 400 })
        }

        console.log(`Fetching location for ${objectType} with ID: ${objectId}`)

        const { data: profileData, error: profileError } = await locals.supabase
            .from("profiles")
            .select("master_map_id")
            .eq("id", userId)
            .single()

        if (profileError) {
            console.error("Supabase error fetching profile:", profileError)
            throw profileError
        }

        const masterMapId = profileData.master_map_id
        if (!masterMapId) {
            console.error("No master_map_id found for user")
            return json(
                { error: "No master map associated with user" },
                { status: 400 },
            )
        }

        let location
        let type

        switch (objectType) {
            case "field":
                const { data: fieldData, error: fieldError } = await locals.supabase
                    .from("fields")
                    .select("boundary")
                    .eq("map_id", masterMapId)
                    .eq("field_id", objectId)
                    .single()

                if (fieldError) {
                    console.error("Supabase error fetching field:", fieldError)
                    throw fieldError
                }

                const boundary = fieldData.boundary
                console.log("Fetched boundary:", boundary)

                if (
                    boundary &&
                    (boundary.type === "MultiPolygon" || boundary.type === "Polygon")
                ) {
                    console.log(`Processing ${boundary.type}`)
                    const coordinates =
                        boundary.type === "MultiPolygon"
                            ? boundary.coordinates
                            : [boundary.coordinates]
                    location = calculateBoundingBox(coordinates)
                    type = "boundingBox"
                } else {
                    console.log("Unknown geometry type:", boundary?.type)
                    return json({ error: "Invalid geometry type" }, { status: 400 })
                }
                break

            case "vehicle":
                const { data: vehicleData, error: vehicleError } = await locals.supabase
                    .from("vehicle_state")
                    .select("coordinates")
                    .eq("master_map_id", masterMapId)
                    .eq("vehicle_id", objectId)
                    .single()

                if (vehicleError) {
                    console.error("Supabase error fetching vehicle:", vehicleError)
                    throw vehicleError
                }

                console.log("Fetched vehicle data:", vehicleData)

                if (!vehicleData || !vehicleData.coordinates) {
                    console.log("No location data found for vehicle:", objectId)
                    return json({ error: "Vehicle location not found" }, { status: 404 })
                }

                // Parse the coordinates string
                const coordinatesMatch = vehicleData.coordinates.match(
                    /\(([-\d.]+),([-\d.]+)\)/,
                )
                if (!coordinatesMatch) {
                    console.log("Invalid coordinate format for vehicle:", objectId)
                    return json({ error: "Invalid coordinate format" }, { status: 400 })
                }

                // Extract longitude and latitude
                const longitude = parseFloat(coordinatesMatch[1])
                const latitude = parseFloat(coordinatesMatch[2])

                console.log("Parsed vehicle location:", { longitude, latitude })

                location = [longitude, latitude]
                type = "coordinate"
                break

            case "marker":
                // Simulating fetching a marker's coordinates
                // Replace this with actual database query when implemented
                location = [0, 0] // Example coordinate
                type = "coordinate"
                break

            default:
                return json({ error: "Invalid object type" }, { status: 400 })
        }

        if (!location) {
            return json(
                { error: "Location could not be calculated" },
                { status: 404 },
            )
        }

        console.log("Returning location:", location, "Type:", type)
        return json({ location, type })
    } catch (error) {
        console.error("Error fetching location:", error)
        return json(
            { error: "An error occurred while fetching location" },
            { status: 500 },
        )
    }
}