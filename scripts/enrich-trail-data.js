import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PRIVATE_SUPABASE_SERVICE_ROLE)

// Process trails in parallel for an operation
async function processOperationTrails(operation, operationIndex, totalOperations) {
    console.log(`\n📁 Operation ${operationIndex + 1}/${totalOperations}: ${operation.name} (${operation.id})`)
    
    const results = {
        successful: 0,
        skipped: 0,
        errored: 0,
        trails: []
    }

    try {
        // Get trails for this operation - using path column
        const { data: trails, error: trailsError } = await supabase
            .from('trails')
            .select('id')
            .eq('operation_id', operation.id)
            .not('path', 'is', null)
            .is('trail_distance', null)

        if (trailsError || !trails) {
            console.log(`   ❌ Could not fetch trails: ${trailsError?.message || 'Unknown error'}`)
            return results
        }

        if (trails.length === 0) {
            console.log(`   ✅ No trails need processing`)
            return results
        }

        console.log(`   Found ${trails.length} trails to process`)
        results.trails = trails

        // Process all trails in parallel (with reasonable batch size)
        const batchSize = 8
        const batches = []
        
        for (let i = 0; i < trails.length; i += batchSize) {
            const batch = trails.slice(i, i + batchSize)
            batches.push(batch)
        }

        // Process batches sequentially, but trails within each batch in parallel
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex]
            
            const batchPromises = batch.map(async (trail, index) => {
                const globalIndex = batchIndex * batchSize + index
                const progress = `${globalIndex + 1}/${trails.length}`
                
                try {
                    const { data: result, error: rpcError } = await supabase
                        .rpc('backfill_trail_metrics', {
                            trail_id_param: trail.id
                        })

                    if (rpcError) {
                        console.log(`   ❌ [${progress}] RPC error: ${rpcError.message.substring(0, 60)}...`)
                        results.errored++
                        return
                    }

                    if (!result?.success) {
                        console.log(`   ❌ [${progress}] Failed: ${result?.error || 'Unknown error'}`)
                        results.errored++
                        return
                    }

                    if (result.skipped) {
                        console.log(`   ⚠️  [${progress}] Already processed`)
                        results.skipped++
                        return
                    }

                    const metrics = result.metrics || {}
                    console.log(`   ✅ [${progress}] ${metrics.trail_distance}m, ${metrics.trail_hectares}ha, ${metrics.trail_percentage_overlap}%`)
                    results.successful++

                } catch (error) {
                    console.log(`   ❌ [${progress}] Error: ${error.message.substring(0, 60)}...`)
                    results.errored++
                }
            })

            // Wait for this batch to complete
            await Promise.allSettled(batchPromises) // Use allSettled so one failure doesn't kill the batch
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100))
        }

    } catch (error) {
        console.log(`   ❌ Operation failed: ${error.message}`)
        results.errored = 1 // Mark operation as errored
    }

    console.log(`   📊 Complete: ✅ ${results.successful} | ⚠️ ${results.skipped} | ❌ ${results.errored}`)
    return results
}

async function backfillTrailMetrics() {
    console.log('🚀 Starting trail metrics backfill (using path geometry)...\n')
    
    const startTime = Date.now()

    // Just get all operations - don't try to be clever about filtering
    console.log('Fetching all operations...')
    const { data: operations, error: operationsError } = await supabase
        .from('operations')
        .select('id, name')
        .order('created_at', { ascending: true })

    if (operationsError || !operations) {
        console.log(`❌ Could not fetch operations: ${operationsError?.message || 'Unknown error'}`)
        console.log('Exiting...')
        return
    }

    console.log(`Found ${operations.length} operations to check\n`)

    let totalTrailsProcessed = 0
    let totalTrailsSuccessful = 0
    let totalTrailsSkipped = 0
    let totalTrailsErrored = 0

    // Process operations in smaller parallel groups
    const operationBatchSize = 3 // Process 3 operations at a time
    
    for (let i = 0; i < operations.length; i += operationBatchSize) {
        const operationBatch = operations.slice(i, i + operationBatchSize)
        
        // Process this batch of operations in parallel
        const batchPromises = operationBatch.map((operation, index) => 
            processOperationTrails(operation, i + index, operations.length)
        )
        
        const batchResults = await Promise.allSettled(batchPromises)
        
        // Aggregate results from this batch
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                const opResult = result.value
                totalTrailsProcessed += opResult.trails.length
                totalTrailsSuccessful += opResult.successful
                totalTrailsSkipped += opResult.skipped
                totalTrailsErrored += opResult.errored
            } else {
                console.log(`   ❌ Operation batch failed: ${result.reason?.message || 'Unknown error'}`)
            }
        })

        // Progress update every few batches
        if ((i + operationBatchSize) % 15 === 0 || (i + operationBatchSize) >= operations.length) {
            const elapsedMinutes = Math.round((Date.now() - startTime) / 60000)
            const processed = Math.min(i + operationBatchSize, operations.length)
            const avgPerMinute = totalTrailsProcessed / Math.max(elapsedMinutes, 1)
            
            console.log(`\n📈 Progress: ${processed}/${operations.length} operations (${Math.round(processed / operations.length * 100)}%) - ${elapsedMinutes}m elapsed`)
            console.log(`   Trails: ${totalTrailsProcessed} total | ✅ ${totalTrailsSuccessful} | ⚠️ ${totalTrailsSkipped} | ❌ ${totalTrailsErrored}`)
            console.log(`   Rate: ~${Math.round(avgPerMinute)} trails/minute`)
        }

        // Small delay between operation batches
        await new Promise(resolve => setTimeout(resolve, 500))
    }

    const totalMinutes = Math.round((Date.now() - startTime) / 60000)
    const avgPerMinute = totalTrailsProcessed / Math.max(totalMinutes, 1)
    
    console.log(`\n🎉 Backfill complete in ${totalMinutes} minutes!`)
    console.log(`📊 Final Results:`)
    console.log(`   Operations checked: ${operations.length}`)
    console.log(`   Total trails processed: ${totalTrailsProcessed}`)
    console.log(`   ✅ Successful: ${totalTrailsSuccessful}`)
    console.log(`   ⚠️  Skipped: ${totalTrailsSkipped}`)
    console.log(`   ❌ Errored: ${totalTrailsErrored}`)
    console.log(`   Average rate: ${Math.round(avgPerMinute)} trails/minute`)
    
    if (totalTrailsProcessed > totalTrailsSkipped) {
        console.log(`   Success rate: ${Math.round(totalTrailsSuccessful / (totalTrailsProcessed - totalTrailsSkipped) * 100)}%`)
    }

    if (totalTrailsErrored > 0) {
        console.log(`\n💡 ${totalTrailsErrored} trails failed. Run the script again to retry them.`)
    }
}

async function checkBackfillStatus() {
    console.log('📊 Checking status...')
    
    const { data, error } = await supabase
        .from('trails')
        .select('trail_distance')
        .not('path', 'is', null) // Using path column

    if (error || !data) {
        console.log(`❌ Could not check status: ${error?.message || 'Unknown error'}`)
        return
    }

    const total = data.length
    const completed = data.filter(t => t.trail_distance !== null).length
    const remaining = total - completed
    const percentage = Math.round(completed / total * 100)
    
    console.log(`   Completed: ${completed}/${total} (${percentage}%)`)
    console.log(`   Remaining: ${remaining}`)
    
    if (remaining === 0) {
        console.log('\n🎉 All trails have been processed!')
    }
}

async function main() {
    const args = process.argv.slice(2)
    
    if (args.includes('--status')) {
        await checkBackfillStatus()
    } else {
        await backfillTrailMetrics()
    }
}

main()
    .then(() => {
        console.log('\n✅ Script completed')
        process.exit(0)
    })
    .catch(error => {
        console.log('Script encountered an error but completing anyway:', error.message)
        process.exit(0) // Exit successfully even if there are errors
    })