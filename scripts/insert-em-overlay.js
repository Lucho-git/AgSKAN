import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PRIVATE_SUPABASE_SERVICE_ROLE)

const FILES = [
    { filename: 'S01_reefinate.geojson', name: 'S01 Reefinate' },
    { filename: 'S02_reefinate.geojson', name: 'S02 Reefinate' },
    { filename: 'S03_reefinate.geojson', name: 'S03 Reefinate' },
    { filename: 'S04_reefinate.geojson', name: 'S04 Reefinate' },
        { filename: 'S05_reefinate.geojson', name: 'S04 Reefinate' },

]

const MAP_ID = '8a28e15f-58f1-474d-9b18-a9bf62565e2d'
const STORAGE_PATH = 'user_6f1ae4d2-2000-4eeb-ad71-bf43580693a1/Reefinate'

async function insertEmOverlay(fileInfo) {
    const filePath = `${STORAGE_PATH}/${fileInfo.filename}`
    
    console.log(`\n📥 Processing: ${fileInfo.filename}`)
    
    // Download the GeoJSON from storage
    const { data: fileData, error: downloadError } = await supabase.storage
        .from('user_files_bucket')
        .download(filePath)

    if (downloadError) {
        throw new Error(`Failed to download ${fileInfo.filename}: ${downloadError.message}`)
    }

    // Parse the GeoJSON
    const geojsonText = await fileData.text()
    const geojson = JSON.parse(geojsonText)

    console.log(`   Loaded ${geojson.features?.length || 0} features`)

    // Get min/max Ripper values
    const ripperValues = geojson.features
        .map(f => f.properties?.Ripper)
        .filter(v => v !== null && v !== undefined)
    
    const minValue = Math.min(...ripperValues)
    const maxValue = Math.max(...ripperValues)
    
    console.log(`   Ripper range: ${minValue} - ${maxValue} mS/m`)

    // Insert into em_overlays table
    const { data, error: insertError } = await supabase
        .from('em_overlays')
        .insert({
            map_id: MAP_ID,
            name: fileInfo.name,
            geojson: geojson
        })
        .select()

    if (insertError) {
        throw new Error(`Failed to insert ${fileInfo.name}: ${insertError.message}`)
    }

    console.log(`   ✅ Inserted: ${fileInfo.name} (id: ${data[0].id})`)
    
    return data[0]
}

async function main() {
    console.log('🚀 Starting EM overlay import...')
    console.log(`   Map ID: ${MAP_ID}`)
    console.log(`   Files to process: ${FILES.length}`)
    
    const results = []
    const errors = []
    
    for (const fileInfo of FILES) {
        try {
            const result = await insertEmOverlay(fileInfo)
            results.push(result)
        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`)
            errors.push({ file: fileInfo.filename, error: error.message })
        }
    }
    
    console.log('\n📊 Summary:')
    console.log(`   Successful: ${results.length}`)
    console.log(`   Failed: ${errors.length}`)
    
    if (errors.length > 0) {
        console.log('\n❌ Errors:')
        errors.forEach(e => console.log(`   - ${e.file}: ${e.error}`))
    }
}

main()
    .then(() => {
        console.log('\n✨ Script completed')
        process.exit(0)
    })
    .catch(error => {
        console.error('\n💥 Script failed:', error)
        process.exit(1)
    })