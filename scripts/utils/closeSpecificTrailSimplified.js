// scripts/closeSpecificTrailSimplified.js
// Manually close a specific trail by ID using SIMPLIFIED path for calculations
// *** USE THIS FOR VERY LONG TRAILS (100K+ points) ***
// This uses Douglas-Peucker simplified path for buffer calculations to avoid database crashes
// Distance calculations ALSO use simplified path for very large trails
// Usage: Update TRAIL_ID constant and run: node scripts/closeSpecificTrailSimplified.js

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { simplifyPath } from '../../src/lib/utils/pathSimplification.js'

dotenv.config()

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PRIVATE_SUPABASE_SERVICE_ROLE)

// *** CONFIGURE THIS ***
const TRAIL_ID = 'cfd945c3-fc05-43f7-afce-17264e989fe3'
// **********************

// Helper function to log with timestamps
function logWithTimestamp(message) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${message}`)
}

async function validateGeometry(path) {
    try {
        if (!path.startsWith('SRID=4326;LINESTRING')) {
            throw new Error('Invalid geometry format')
        }
        if (path.length < 30) {
            throw new Error('Path too short to be valid')
        }
        return true
    } catch (error) {
        throw new Error(`Geometry validation failed: ${error.message}`)
    }
}

async function deleteTrailAndPoints(trailId) {
    console.log(`\nDeleting trail ${trailId} and all its points...`)
    
    const { error: pointsDeleteError } = await supabase
        .from('trail_stream')
        .delete()
        .eq('trail_id', trailId)

    if (pointsDeleteError) throw new Error(`Error deleting points: ${pointsDeleteError.message}`)

    const { error: trailDeleteError } = await supabase
        .from('trails')
        .delete()
        .eq('id', trailId)

    if (trailDeleteError) throw new Error(`Error deleting trail: ${trailDeleteError.message}`)

    console.log(`✓ Successfully deleted trail ${trailId} and its points`)
}

async function closeSpecificTrailSimplified() {
    try {
        console.log(`\n╔════════════════════════════════════════════════════════════════╗`)
        console.log(`║  Closing Trail with SIMPLIFIED Calculations                    ║`)
        console.log(`║  Trail ID: ${TRAIL_ID.substring(0, 36)} ║`)
        console.log(`╚════════════════════════════════════════════════════════════════╝\n`)
        
        console.log(`⚠️  NOTE: This script uses Douglas-Peucker simplified path for`)
        console.log(`   ALL calculations to handle very large trails.\n`)
        console.log(`   ✓ Distance: Uses simplified path (accurate, geometry-preserving)`)
        console.log(`   ✓ Area/Overlap: Uses simplified path (fast, geometry-preserving)\n`)

        // Verify trail exists and is open
        logWithTimestamp(`Verifying trail exists...`)
        const { data: trail, error: verifyError } = await supabase
            .from('trails')
            .select('id, end_time, vehicle_id, operation_id, start_time')
            .eq('id', TRAIL_ID)
            .single()

        if (verifyError) {
            throw new Error(`Error verifying trail: ${verifyError.message}`)
        }
        
        if (!trail) {
            throw new Error(`Trail ${TRAIL_ID} does not exist`)
        }

        if (trail.end_time) {
            console.log(`⚠️  Trail ${TRAIL_ID} is already closed.`)
            console.log(`   End time: ${trail.end_time}`)
            console.log(`   No action needed.`)
            return
        }

        console.log(`Trail Information:`)
        console.log(`  ID: ${trail.id}`)
        console.log(`  Vehicle: ${trail.vehicle_id}`)
        console.log(`  Operation: ${trail.operation_id}`)
        console.log(`  Start Time: ${trail.start_time}`)
        console.log(`  Status: OPEN\n`)

        // Fetch all trail points
        logWithTimestamp(`Fetching trail points...`)
        const fetchStartTime = Date.now()
        const { data: trailPoints, error: pointsError } = await supabase
            .from('trail_stream')
            .select('*')
            .eq('trail_id', TRAIL_ID)
            .order('timestamp', { ascending: true })

        if (pointsError) {
            throw new Error(`Error fetching points: ${pointsError.message}`)
        }

        const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2)
        logWithTimestamp(`✓ Retrieved ${trailPoints.length.toLocaleString()} trail points in ${fetchDuration}s`)

        if (!trailPoints || trailPoints.length === 0) {
            console.log(`⚠️  No points found for trail ${TRAIL_ID}`)
            console.log(`   Deleting empty trail...`)
            await deleteTrailAndPoints(TRAIL_ID)
            return
        }

        // Validate and filter points
        logWithTimestamp(`Validating coordinates...`)
        const validPoints = trailPoints.filter(point => 
            point.coordinate?.coordinates?.length === 2 &&
            !isNaN(point.coordinate.coordinates[0]) && 
            !isNaN(point.coordinate.coordinates[1])
        )

        console.log(`✓ Valid points: ${validPoints.length.toLocaleString()}/${trailPoints.length.toLocaleString()}`)
        
        if (validPoints.length !== trailPoints.length) {
            console.log(`⚠️  Filtered out ${(trailPoints.length - validPoints.length).toLocaleString()} invalid points`)
        }

        if (validPoints.length < 2) {
            console.log(`\n⚠️  Insufficient valid points (${validPoints.length})`)
            console.log(`   Minimum required: 2`)
            console.log(`   Deleting trail...`)
            await deleteTrailAndPoints(TRAIL_ID)
            return
        }

        // Get end time from last point
        const endTime = trailPoints[trailPoints.length - 1].timestamp

        // Prepare points for simplification
        logWithTimestamp(`Preparing path data...`)
        const pathForSimplification = validPoints.map(point => ({
            coordinates: `(${point.coordinate.coordinates[0]},${point.coordinate.coordinates[1]})`,
            timestamp: point.timestamp
        }))

        // Apply Douglas-Peucker simplification
        logWithTimestamp(`Applying Douglas-Peucker simplification (tolerance: 0.000005)...`)
        const simplifyStartTime = Date.now()
        console.log(`This preserves all important geometry (turns, loops) while reducing points`)
        const simplifiedPath = simplifyPath(pathForSimplification, 0.002)

        const simplifyDuration = ((Date.now() - simplifyStartTime) / 1000).toFixed(2)
        logWithTimestamp(`✓ Simplified to ${simplifiedPath.length.toLocaleString()} points in ${simplifyDuration}s`)
        console.log(`  Reduction: ${Math.round((1 - simplifiedPath.length / validPoints.length) * 100)}%`)
        console.log(`  This simplified path will be used for ALL calculations\n`)

        // Check if simplified path is still valid
        if (!simplifiedPath || simplifiedPath.length < 3) {
            console.log(`⚠️  Simplified path too short (${simplifiedPath?.length || 0} points)`)
            console.log(`   Minimum required after simplification: 3`)
            console.log(`   Deleting trail...`)
            await deleteTrailAndPoints(TRAIL_ID)
            return
        }

        // Build simplified path with timestamps (LINESTRING M) - for distance calculations
        logWithTimestamp(`Building simplified path with timestamps (LINESTRING M) - for distance calculations...`)
        const detailedBuildStart = Date.now()
        const detailedLineString = simplifiedPath
            .map(point => {
                const coords = point.coordinates.match(/\((.*?),(.*?)\)/)
                if (!coords) throw new Error('Invalid coordinates in simplified path')
                const timestamp = point.timestamp || new Date().toISOString()
                return `${coords[1]} ${coords[2]} ${new Date(timestamp).getTime()}`
            })
            .join(',')
        const detailedPath = `SRID=4326;LINESTRING M(${detailedLineString})`

        await validateGeometry(detailedPath)
        const detailedBuildDuration = ((Date.now() - detailedBuildStart) / 1000).toFixed(2)
        logWithTimestamp(`✓ Simplified path with timestamps validated (${simplifiedPath.length.toLocaleString()} points) in ${detailedBuildDuration}s`)

        // Build simplified path (LINESTRING) - for buffer/area calculations
        logWithTimestamp(`Building simplified path (LINESTRING) - for buffer/area calculations...`)
        const simplifiedBuildStart = Date.now()
        const simplifiedLineString = simplifiedPath
            .map(point => {
                const coords = point.coordinates.match(/\((.*?),(.*?)\)/)
                if (!coords) throw new Error('Invalid coordinates in simplified path')
                return `${coords[1]} ${coords[2]}`
            })
            .join(',')
        const finalPath = `SRID=4326;LINESTRING(${simplifiedLineString})`

        await validateGeometry(finalPath)
        const simplifiedBuildDuration = ((Date.now() - simplifiedBuildStart) / 1000).toFixed(2)
        logWithTimestamp(`✓ Simplified path validated (${simplifiedPath.length.toLocaleString()} points) in ${simplifiedBuildDuration}s\n`)

        // Call close_trail_simplified RPC function
        console.log(`Calling close_trail_simplified function...`)
        console.log(`This will:`)
        console.log(`  1. Calculate distance using simplified path (${simplifiedPath.length.toLocaleString()} points)`)
        console.log(`  2. Calculate area/overlap using simplified path (${simplifiedPath.length.toLocaleString()} points)`)
        console.log(`  3. Delete trail_stream points`)
        console.log(``)
        
        logWithTimestamp(`🕐 Starting RPC call to close_trail_simplified...`)
        const rpcStartTime = Date.now()

        try {
            const { data: result, error: updateError } = await supabase.rpc('close_trail_simplified', {
                trail_id_param: TRAIL_ID,
                end_time_param: endTime,
                path_param: finalPath,
                detailed_path_param: detailedPath
            })

            const rpcDuration = ((Date.now() - rpcStartTime) / 1000).toFixed(2)
            logWithTimestamp(`✓ RPC call completed in ${rpcDuration} seconds`)

            if (updateError) {
                throw new Error(`Database update failed: ${updateError.message}`)
            }

            if (!result?.success) {
                throw new Error(`Trail closure failed: ${JSON.stringify(result.errors || result.error)}`)
            }

            console.log(`\n╔════════════════════════════════════════════════════════════════╗`)
            console.log(`║  ✅ SUCCESS! Trail closed successfully                         ║`)
            console.log(`╚════════════════════════════════════════════════════════════════╝\n`)
            
            console.log(`Summary:`)
            console.log(`  End time: ${endTime}`)
            console.log(`  Original points: ${trailPoints.length.toLocaleString()}`)
            console.log(`  Valid points: ${validPoints.length.toLocaleString()}`)
            console.log(`  Simplified points (for calculations): ${simplifiedPath.length.toLocaleString()}`)
            console.log(`  Reduction: ${Math.round((1 - simplifiedPath.length / validPoints.length) * 100)}%`)
            
            if (result.metrics) {
                console.log(`\nCalculated Metrics:`)
                console.log(`  Distance: ${result.metrics.trail_distance}m (from simplified path)`)
                console.log(`  Area: ${result.metrics.trail_hectares} hectares (from simplified path)`)
                console.log(`  Overlap: ${result.metrics.trail_hectares_overlap} hectares (${result.metrics.trail_percentage_overlap}%)`)
            }
            
            if (result.note) {
                console.log(`\nNote: ${result.note}`)
            }

        } catch (error) {
            const rpcDuration = ((Date.now() - rpcStartTime) / 1000).toFixed(2)
            logWithTimestamp(`❌ RPC call failed after ${rpcDuration} seconds`)
            throw error
        }

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}`)
        console.error('\nFull error:', error)
        process.exit(1)
    }
}

closeSpecificTrailSimplified()
    .then(() => {
        console.log('\n✓ Script completed successfully')
        process.exit(0)
    })
    .catch(error => {
        console.error('\n✗ Script failed:', error)
        process.exit(1)
    })