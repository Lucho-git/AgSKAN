// scripts/closeSpecificTrail.js
// Manually close a specific trail by ID
// Usage: Update TRAIL_ID constant and run: node scripts/closeSpecificTrail.js

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { simplifyPath } from '../../src/lib/utils/pathSimplification.js'

dotenv.config()

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PRIVATE_SUPABASE_SERVICE_ROLE)

// *** CONFIGURE THIS ***
const TRAIL_ID = 'bdc2dd4b-b3e1-4cfd-8726-1e9c96e0e032'
// **********************

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
    
    // Delete points first due to foreign key constraint
    const { error: pointsDeleteError } = await supabase
        .from('trail_stream')
        .delete()
        .eq('trail_id', trailId)

    if (pointsDeleteError) throw new Error(`Error deleting points: ${pointsDeleteError.message}`)

    // Then delete the trail
    const { error: trailDeleteError } = await supabase
        .from('trails')
        .delete()
        .eq('id', trailId)

    if (trailDeleteError) throw new Error(`Error deleting trail: ${trailDeleteError.message}`)

    console.log(`✓ Successfully deleted trail ${trailId} and its points`)
}

async function closeSpecificTrail() {
    try {
        console.log(`\n=== Closing Trail: ${TRAIL_ID} ===\n`)

        // Verify trail exists and is open
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
        console.log(`Fetching trail points...`)
        const { data: trailPoints, error: pointsError } = await supabase
            .from('trail_stream')
            .select('*')
            .eq('trail_id', TRAIL_ID)
            .order('timestamp', { ascending: true })

        if (pointsError) {
            throw new Error(`Error fetching points: ${pointsError.message}`)
        }

        if (!trailPoints || trailPoints.length === 0) {
            console.log(`⚠️  No points found for trail ${TRAIL_ID}`)
            console.log(`   Deleting empty trail...`)
            await deleteTrailAndPoints(TRAIL_ID)
            return
        }

        console.log(`✓ Retrieved ${trailPoints.length} trail points\n`)

        // Validate and filter points
        console.log(`Validating coordinates...`)
        const validPoints = trailPoints.filter(point => 
            point.coordinate?.coordinates?.length === 2 &&
            !isNaN(point.coordinate.coordinates[0]) && 
            !isNaN(point.coordinate.coordinates[1])
        )

        console.log(`✓ Valid points: ${validPoints.length}/${trailPoints.length}`)
        
        if (validPoints.length !== trailPoints.length) {
            console.log(`⚠️  Filtered out ${trailPoints.length - validPoints.length} invalid points`)
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
        console.log(`\nPreparing path data...`)
        const pathForSimplification = validPoints.map(point => ({
            coordinates: `(${point.coordinate.coordinates[0]},${point.coordinate.coordinates[1]})`
        }))

        // Apply Douglas-Peucker simplification
        console.log(`Applying Douglas-Peucker simplification (tolerance: 0.000005)...`)
        const simplifiedPath = simplifyPath(pathForSimplification, 0.000005)

        console.log(`✓ Simplified to ${simplifiedPath.length} points`)
        console.log(`  Reduction: ${Math.round((1 - simplifiedPath.length / validPoints.length) * 100)}%\n`)

        // Check if simplified path is still valid
        if (!simplifiedPath || simplifiedPath.length < 3) {
            console.log(`⚠️  Simplified path too short (${simplifiedPath?.length || 0} points)`)
            console.log(`   Minimum required after simplification: 3`)
            console.log(`   Deleting trail...`)
            await deleteTrailAndPoints(TRAIL_ID)
            return
        }

        // Build detailed path (LINESTRING M with timestamps)
        console.log(`Building detailed path (LINESTRING M)...`)
        const detailedLineString = validPoints
            .map(point => {
                const [lng, lat] = point.coordinate.coordinates
                return `${lng} ${lat} ${new Date(point.timestamp).getTime()}`
            })
            .join(',')
        const detailedPath = `SRID=4326;LINESTRING M(${detailedLineString})`

        await validateGeometry(detailedPath)
        console.log(`✓ Detailed path validated`)

        // Build simplified path (LINESTRING)
        console.log(`Building simplified path (LINESTRING)...`)
        const simplifiedLineString = simplifiedPath
            .map(point => {
                const coords = point.coordinates.match(/\((.*?),(.*?)\)/)
                if (!coords) throw new Error('Invalid coordinates in simplified path')
                return `${coords[1]} ${coords[2]}`
            })
            .join(',')
        const finalPath = `SRID=4326;LINESTRING(${simplifiedLineString})`

        await validateGeometry(finalPath)
        console.log(`✓ Simplified path validated\n`)

        // Call close_trail RPC function
        console.log(`Calling close_trail function...`)
        const { data: result, error: updateError } = await supabase.rpc('close_trail', {
            trail_id_param: TRAIL_ID,
            end_time_param: endTime,
            path_param: finalPath,
            detailed_path_param: detailedPath
        })

        if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`)
        }

        if (!result?.success) {
            throw new Error(`Trail closure failed: ${JSON.stringify(result.errors || result.error)}`)
        }

        console.log(`\n✅ SUCCESS! Trail ${TRAIL_ID} closed successfully\n`)
        console.log(`Summary:`)
        console.log(`  End time: ${endTime}`)
        console.log(`  Original points: ${trailPoints.length}`)
        console.log(`  Valid points: ${validPoints.length}`)
        console.log(`  Simplified points: ${simplifiedPath.length}`)
        console.log(`  Reduction: ${Math.round((1 - simplifiedPath.length / validPoints.length) * 100)}%`)
        
        if (result.metrics) {
            console.log(`\nCalculated Metrics:`)
            console.log(`  Distance: ${result.metrics.trail_distance}m`)
            console.log(`  Area: ${result.metrics.trail_hectares} hectares`)
            console.log(`  Overlap: ${result.metrics.trail_hectares_overlap} hectares (${result.metrics.trail_percentage_overlap}%)`)
        }

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}`)
        console.error('\nFull error:', error)
        process.exit(1)
    }
}

closeSpecificTrail()
    .then(() => {
        console.log('\n✓ Script completed successfully')
        process.exit(0)
    })
    .catch(error => {
        console.error('\n✗ Script failed:', error)
        process.exit(1)
    })