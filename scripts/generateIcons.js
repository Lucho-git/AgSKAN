import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createCanvas, loadImage } from 'canvas'
import fs from 'fs'
import { atlasIconSvgs } from './atlas-icons.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const customSvgIcons = [
  "rock",
  "tree13", 
  "watertank2",
  "wheat2",
  "kangaroo",
  "electric_tower",
  "gate",
  "machine_pump",
  "recharge_icon",
  "repair_shop",
  "tractor",
  "silo2",
  "tree_stump",
  "workshop_icon",
  "mapbox-marker"  
]

const ionicIcons = [
  "pin", "arrow-up-circle", "arrow-down-circle", "arrow-back-circle", 
  "arrow-forward-circle", "thumbs-down", "thumbs-up", "accessibility", 
  "people", "settings", "home", "checkmark-circle", "close-circle",
  "information-circle", "warning", "help-circle", "ban", "location",
  "lock-closed", "lock-open", "trash", "cart", "locate", "leaf", "call",
  "wifi", "radio", "cloud-offline", "battery-charging", "thermometer",
  "sunny", "cloud", "thunderstorm", "rainy", "water", "fast-food",
  "restaurant", "airplane", "trail-sign", "car", "beer", "bonfire",
  "boat", "bed", "bicycle", "build", "desktop", "earth", "camera",
  "fish", "flame", "footsteps", "key", "man", "paw", "skull",
  "construct", "bus", "subway", "telescope"
]

const atlasIcons = [
  "construction-truck", "electric-car", "gasoline", "kg-weight", "carrot",
  "middle-finger", "toilet-bathroom", "car-garage", "electricity-home",
  "carrot-turnip-vegetable", "wheat-harvest", "helicopter-travel",
  "camper-vehicle", "cargo-transport", "bulldozer", "construction-transport",
  "crane-truck", "delivery-truck", "liquid-transportation", "transport-truck",
  "ladder-truck"
]

// Function to extract everything from IconSVG.svelte including individual defs
function extractSvgContent() {
  const iconSvgPath = path.join(__dirname, '../src/components/IconSVG.svelte')
  const content = readFileSync(iconSvgPath, 'utf-8')
  
  const symbols = {}
  const allDefs = {}
  let globalDefsContent = ''
  let globalStyleContent = ''
  
  // Extract global <defs> content (if any)
  const globalDefsMatch = content.match(/<defs(?![^>]*id=)[^>]*>([\s\S]*?)<\/defs>/i)
  if (globalDefsMatch) {
    globalDefsContent = globalDefsMatch[1]
    console.log('📝 Found global <defs> content')
  }
  
  // Extract global <style> content (if any)
  const globalStyleMatch = content.match(/<style(?![^>]*id=)[^>]*>([\s\S]*?)<\/style>/i)
  if (globalStyleMatch) {
    globalStyleContent = globalStyleMatch[1]
    console.log('🎨 Found global <style> content')
  }
  
  // Extract individual <defs> sections with IDs
  const defsRegex = /<defs\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/defs>/g
  let defsMatch
  while ((defsMatch = defsRegex.exec(content)) !== null) {
    const [, defsId, defsContent] = defsMatch
    allDefs[defsId] = defsContent.trim()
    console.log(`📦 Found <defs> for: ${defsId}`)
  }
  
  // Extract symbols
  const symbolRegex = /<symbol\s+id="([^"]+)"\s+viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g
  let symbolMatch
  
  while ((symbolMatch = symbolRegex.exec(content)) !== null) {
    const [, id, viewBox, pathContent] = symbolMatch
    symbols[id] = {
      viewBox,
      content: pathContent.trim()
    }
  }
  
  console.log(`📦 Extracted ${Object.keys(symbols).length} symbols`)
  console.log(`📦 Extracted ${Object.keys(allDefs).length} individual defs`)
  
  return { symbols, allDefs, globalDefsContent, globalStyleContent }
}

// Function to calculate proper scaling and centering for SVG content
function calculateIconTransform(viewBox, targetSize) {
  // Parse viewBox "x y width height"
  const [x, y, width, height] = viewBox.split(' ').map(Number)
  
  // Calculate scale to fit the icon nicely within target size
  const scale = targetSize / Math.max(width, height)
  
  // Calculate centering offsets
  const scaledWidth = width * scale
  const scaledHeight = height * scale
  const offsetX = (targetSize - scaledWidth) / 2
  const offsetY = (targetSize - scaledHeight) / 2
  
  return {
    scale,
    translateX: offsetX - (x * scale),  // Account for viewBox offset
    translateY: offsetY - (y * scale)   // Account for viewBox offset
  }
}

// Function to create complete SVG with properly sized content
function createCompleteSvg(iconId, symbolData, allDefs, globalDefsContent, globalStyleContent, size) {
  // Look for defs specific to this icon
  const iconDefsId = `${iconId}-defs`
  const iconSpecificDefs = allDefs[iconDefsId] || ''
  
  // Combine all relevant content
  let defsContent = globalDefsContent
  if (iconSpecificDefs) {
    defsContent += iconSpecificDefs
    console.log(`🎯 Using specific defs for ${iconId}`)
  }
  
  // Calculate proper transform for this icon (use 80% of size for padding)
  const iconSize = size * 0.8
  const transform = calculateIconTransform(symbolData.viewBox, iconSize)
  const centerOffset = (size - iconSize) / 2
  
  // Create complete SVG
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    ${globalStyleContent ? `<style>${globalStyleContent}</style>` : ''}
    ${defsContent ? `<defs>${defsContent}</defs>` : ''}
    
    <!-- Icon content properly scaled and centered -->
    <g transform="translate(${centerOffset + transform.translateX}, ${centerOffset + transform.translateY}) scale(${transform.scale})">
      ${symbolData.content}
    </g>
  </svg>`
  
  return svg
}

// Generate high-DPI PNG for custom icon
async function generateCustomPng(iconId, symbols, allDefs, globalDefsContent, globalStyleContent, outputDir) {
  const symbolData = symbols[iconId]
  if (!symbolData) {
    console.warn(`❌ No symbol found for: ${iconId}`)
    return generateErrorPng(outputDir, iconId)
  }
  
  try {
    // HIGH-DPI settings for ultra-crisp icons
    const displaySize = 35  // Final display size
    const dpiScale = 3      // 3x for ultra-crisp icons
    const canvasSize = displaySize * dpiScale  // 105px canvas
    
    const canvas = createCanvas(canvasSize, canvasSize)
    const ctx = canvas.getContext('2d')
    
    // Enable highest quality rendering
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.textRenderingOptimization = 'optimizeQuality'
    
    // Skip background circle for mapbox-marker (it has its own background)
    const skipBackground = iconId === 'mapbox-marker'
    
    if (!skipBackground) {
      // Draw background circle with LightGray for all other icons
      const centerX = canvasSize / 2
      const centerY = canvasSize / 2
      const radius = (canvasSize / 2) - (1 * dpiScale)
      
      ctx.fillStyle = 'rgba(211, 211, 211, 0.9)'
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
      ctx.fill()
      
      // Add shadow effect
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
      ctx.shadowBlur = 4 * dpiScale
      ctx.shadowOffsetY = 2 * dpiScale
      ctx.fill()
      
      // Reset shadow for the icon
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
    }
    
    // Create complete SVG at high resolution
    const svgSize = Math.floor(canvasSize * (skipBackground ? 1.0 : 0.85))
    const completeSvg = createCompleteSvg(iconId, symbolData, allDefs, globalDefsContent, globalStyleContent, svgSize)
    
    // Load and draw SVG
    const svgBuffer = Buffer.from(completeSvg, 'utf-8')
    const img = await loadImage(svgBuffer)
    
    // Center the icon
    const iconX = (canvasSize - svgSize) / 2
    const iconY = (canvasSize - svgSize) / 2
    
    ctx.drawImage(img, iconX, iconY, svgSize, svgSize)
    
    // Save as high-quality PNG
    const filename = `${iconId}-3x.png`
    const filepath = path.join(outputDir, filename)
    const buffer = canvas.toBuffer('image/png', { compressionLevel: 9, quality: 1.0 })
    fs.writeFileSync(filepath, buffer)
    
    if (skipBackground) {
      console.log(`  ✅ Generated ${filename} (${canvasSize}x${canvasSize}px) - no background circle`)
    } else {
      console.log(`  ✅ Generated ${filename} (${canvasSize}x${canvasSize}px)`)
    }
    return `icons/${filename}`
    
  } catch (error) {
    console.error(`  ❌ Error generating ${iconId}:`, error.message)
    return generateErrorPng(outputDir, iconId)
  }
}

// Generate Ionic icon PNG using Ionicons CDN
async function generateIonicIconPng(iconId, outputDir) {
  try {
    const displaySize = 35
    const dpiScale = 3
    const canvasSize = displaySize * dpiScale

    const canvas = createCanvas(canvasSize, canvasSize)
    const ctx = canvas.getContext('2d')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Draw same LightGray background as custom icons
    const centerX = canvasSize / 2
    const centerY = canvasSize / 2
    const radius = (canvasSize / 2) - (1 * dpiScale)

    ctx.fillStyle = 'rgba(211, 211, 211, 0.9)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.fill()

    // Add shadow effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
    ctx.shadowBlur = 4 * dpiScale
    ctx.shadowOffsetY = 2 * dpiScale
    ctx.fill()

    // Reset shadow
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // Fetch SVG from Ionicons CDN
    const svgUrl = `https://cdn.jsdelivr.net/npm/ionicons@7.1.0/dist/svg/${iconId}.svg`
    
    console.log(`    📡 Downloading: ${svgUrl}`)
    
    try {
      const response = await fetch(svgUrl)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`)
      }
      
      let svgContent = await response.text()
      
      // Verify we got actual SVG content
      if (!svgContent.includes('<svg')) {
        throw new Error('Invalid SVG content received')
      }
      
      console.log(`    ✅ Downloaded SVG for ${iconId} (${svgContent.length} bytes)`)
      
      // Modify SVG to be black and properly sized
      const iconSize = Math.floor(canvasSize * 0.7)
      svgContent = svgContent.replace(
        /<svg([^>]*)>/,
        `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 512 512" fill="black">`
      )
      
      // Load and draw the SVG
      const svgBuffer = Buffer.from(svgContent, 'utf-8')
      const img = await loadImage(svgBuffer)
      
      const iconX = (canvasSize - iconSize) / 2
      const iconY = (canvasSize - iconSize) / 2
      
      ctx.drawImage(img, iconX, iconY, iconSize, iconSize)
      
    } catch (svgError) {
      console.error(`    ❌ SVG download failed for ${iconId}:`, svgError.message)
      console.warn(`    ⚠️  Using fallback placeholder for ${iconId}`)
      
      // Fallback: draw a simple icon placeholder
      ctx.fillStyle = 'black'
      ctx.font = `bold ${Math.floor(canvasSize * 0.3)}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⚡', centerX, centerY)
    }

    // Save PNG
    const filename = `${iconId}-ionic-3x.png`
    const filepath = path.join(outputDir, filename)
    const buffer = canvas.toBuffer('image/png', { compressionLevel: 9, quality: 1.0 })
    fs.writeFileSync(filepath, buffer)

    console.log(`  ✅ Generated Ionic: ${filename}`)
    return `icons/${filename}`

  } catch (error) {
    console.error(`  ❌ Error generating Ionic ${iconId}:`, error.message)
    return generateErrorPng(outputDir, `${iconId}-ionic`)
  }
}

// Generate Atlas icon PNG with SVG support
async function generateAtlasIconPng(iconId, outputDir) {
  try {
    const displaySize = 35
    const dpiScale = 3
    const canvasSize = displaySize * dpiScale

    const canvas = createCanvas(canvasSize, canvasSize)
    const ctx = canvas.getContext('2d')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Draw background circle
    const centerX = canvasSize / 2
    const centerY = canvasSize / 2
    const radius = (canvasSize / 2) - (1 * dpiScale)

    ctx.fillStyle = 'rgba(211, 211, 211, 0.9)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.fill()

    // Add shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
    ctx.shadowBlur = 4 * dpiScale
    ctx.shadowOffsetY = 2 * dpiScale
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // Check if we have SVG content
    const svgContent = atlasIconSvgs[iconId]
    
    if (svgContent && !svgContent.includes('<!-- Paste SVG here -->')) {
      // We have actual SVG content
      const iconSize = Math.floor(canvasSize * 0.7)
      
      // Clean up the SVG and set proper size
      const cleanSvg = svgContent.replace(
        /<svg[^>]*>/,
        `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">`
      )
      
      const svgBuffer = Buffer.from(cleanSvg, 'utf-8')
      const img = await loadImage(svgBuffer)
      
      const iconX = (canvasSize - iconSize) / 2
      const iconY = (canvasSize - iconSize) / 2
      
      ctx.drawImage(img, iconX, iconY, iconSize, iconSize)
      
      console.log(`  ✅ Generated Atlas: ${iconId} (using SVG)`)
      
    } else {
      // Fallback to emoji
      const emojiMap = {
        'construction-truck': '🚚', 'electric-car': '🚗', 'gasoline': '⛽',
        'kg-weight': '⚖️', 'carrot': '🥕', 'middle-finger': '🖕',
        'toilet-bathroom': '🚽', 'car-garage': '🏠', 'electricity-home': '⚡',
        'carrot-turnip-vegetable': '🥕', 'wheat-harvest': '🌾', 'helicopter-travel': '🚁',
        'camper-vehicle': '🚐', 'bulldozer': '🚜', 'crane-truck': '🏗️',
        'cargo-transport': '📦', 'construction-transport': '🚧', 'delivery-truck': '🚛',
        'liquid-transportation': '🛢️', 'transport-truck': '🚚', 'ladder-truck': '🪜'
      }
      
      const emoji = emojiMap[iconId] || '🔧'
      ctx.fillStyle = 'black'
      ctx.font = `${Math.floor(canvasSize * 0.4)}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, centerX, centerY)
      
      console.log(`  ⚠️  Generated Atlas: ${iconId} (using emoji fallback)`)
    }

    // Save PNG
    const filename = `${iconId}-atlas-3x.png`
    const filepath = path.join(outputDir, filename)
    const buffer = canvas.toBuffer('image/png', { compressionLevel: 9, quality: 1.0 })
    fs.writeFileSync(filepath, buffer)

    return `icons/${filename}`

  } catch (error) {
    console.error(`  ❌ Error generating Atlas ${iconId}:`, error.message)
    return generateErrorPng(outputDir, `${iconId}-atlas`)
  }
}

// Generate error fallback PNG
function generateErrorPng(outputDir, iconId) {
  const canvas = createCanvas(105, 105)  // 3x size
  const ctx = canvas.getContext('2d')
  
  // Red background circle
  ctx.fillStyle = '#ff4444'
  ctx.beginPath()
  ctx.arc(52.5, 52.5, 50, 0, 2 * Math.PI)
  ctx.fill()
  
  // White border
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 4
  ctx.stroke()
  
  // White exclamation mark
  ctx.fillStyle = 'white'
  ctx.font = 'bold 48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('!', 52.5, 52.5)
  
  const filename = `${iconId}-error-3x.png`
  const filepath = path.join(outputDir, filename)
  const buffer = canvas.toBuffer('image/png', { compressionLevel: 9 })
  fs.writeFileSync(filepath, buffer)
  
  console.log(`  ⚠️  Generated error fallback: ${filename}`)
  return `icons/${filename}`
}

async function generateDefaultPng(outputDir) {
  // This function will now be used for the "default" fallback only
  // The actual default marker will be the mapbox-marker PNG
  const canvas = createCanvas(105, 105)
  const ctx = canvas.getContext('2d')
  
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // Keep this as a fallback blue circle
  ctx.fillStyle = 'rgba(59, 130, 246, 0.9)'
  ctx.beginPath()
  ctx.arc(52.5, 52.5, 48, 0, 2 * Math.PI)
  ctx.fill()
  
  // White center dot
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(52.5, 52.5, 15, 0, 2 * Math.PI)
  ctx.fill()
  
  const filename = 'fallback-3x.png'  // Rename this
  const filepath = path.join(outputDir, filename)
  const buffer = canvas.toBuffer('image/png', { compressionLevel: 9, quality: 1.0 })
  fs.writeFileSync(filepath, buffer)
  
  console.log(`  ✅ Generated ${filename} (105x105px) - fallback only`)
  return `icons/${filename}`
}

// Main function to generate all high-DPI PNG icons
async function generateHighDpiPngIcons() {
  console.log('🚀 Generating HIGH-DPI PNG icons (all types)...')
  console.log('📐 Rendering at 3x resolution (105x105px) for ultra-crisp display')
  
  // Extract SVG content from IconSVG.svelte
  const { symbols, allDefs, globalDefsContent, globalStyleContent } = extractSvgContent()
  
  // Create output directory for PNG files
  const iconsDir = path.join(__dirname, '../static/icons')
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true })
    console.log(`📁 Created icons directory: ${iconsDir}`)
  }
  
  const iconPaths = {}
  let successCount = 0
  let failureCount = 0
  
  // Generate default marker (now using Mapbox marker)
  console.log('\n📍 Generating default marker (Mapbox pin)...')
  try {
    const defaultMapboxPath = await generateCustomPng(
      'mapbox-marker', 
      symbols, 
      allDefs, 
      globalDefsContent, 
      globalStyleContent, 
      iconsDir
    )
    iconPaths['default'] = defaultMapboxPath
    console.log('  ✅ Default marker set to Mapbox pin style')
    successCount++
  } catch (error) {
    console.warn('  ⚠️  Mapbox marker failed, generating fallback...')
    const fallbackPath = await generateDefaultPng(iconsDir)
    iconPaths['default'] = fallbackPath
    successCount++
  }
  
  // Generate fallback icon (blue circle) separately
  console.log('\n🔵 Generating fallback marker...')
  try {
    const fallbackPath = await generateDefaultPng(iconsDir)
    iconPaths['fallback'] = fallbackPath
    successCount++
  } catch (error) {
    console.error(`  ❌ Failed to generate fallback:`, error.message)
    failureCount++
  }
  
  // Generate custom SVG icons
  console.log('\n🎨 Generating custom SVG icons...')
  for (const iconId of customSvgIcons) {
    try {
      const iconPath = await generateCustomPng(iconId, symbols, allDefs, globalDefsContent, globalStyleContent, iconsDir)
      iconPaths[`custom-svg-${iconId}`] = iconPath
      successCount++
    } catch (error) {
      console.error(`  ❌ Failed to generate ${iconId}:`, error.message)
      failureCount++
    }
  }
  
  // Generate Ionic icons
  console.log('\n⚡ Generating Ionic icons from CDN...')
  for (const iconId of ionicIcons) {
    try {
      const iconPath = await generateIonicIconPng(iconId, iconsDir)
      iconPaths[`ionic-${iconId}`] = iconPath
      successCount++
    } catch (error) {
      console.error(`  ❌ Failed to generate Ionic ${iconId}:`, error.message)
      failureCount++
    }
  }
  
  // Generate Atlas icons
  console.log('\n🗺️ Generating Atlas icons...')
  for (const iconId of atlasIcons) {
    try {
      const iconPath = await generateAtlasIconPng(iconId, iconsDir)
      iconPaths[`at-${iconId}`] = iconPath
      successCount++
    } catch (error) {
      console.error(`  ❌ Failed to generate Atlas ${iconId}:`, error.message)
      failureCount++
    }
  }
  
  // Save the mapping file for the frontend
  const mappingPath = path.join(__dirname, '../static/icon-paths.json')
  writeFileSync(mappingPath, JSON.stringify(iconPaths, null, 2))
  
  console.log(`\n✅ HIGH-DPI PNG generation completed!`)
  console.log(`📊 Success: ${successCount} icons | Failures: ${failureCount} icons`)
  console.log(`📈 Success rate: ${Math.round((successCount / (successCount + failureCount)) * 100)}%`)
  console.log(`📁 PNG files saved to: ${iconsDir}`)
  console.log(`📋 Icon mapping saved to: ${mappingPath}`)
  
  if (failureCount > 0) {
    console.log(`\n⚠️  ${failureCount} icons failed to generate - check logs above for details`)
  }
  
  console.log(`\n🎯 Usage instructions:`)
  console.log(`   - Default marker is now the professional Mapbox pin`)
  console.log(`   - Load PNGs with map.loadImage() and map.addImage()`)
  console.log(`   - Use icon-size: 0.35 to scale 3x images to 1x display`)
  console.log(`   - Icons will be ultra-crisp on all devices and zoom levels`)
}

// Run the generation
generateHighDpiPngIcons().catch(error => {
  console.error('❌ Generation failed:', error)
  process.exit(1)
})