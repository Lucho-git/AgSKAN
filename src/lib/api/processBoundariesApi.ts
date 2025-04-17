// src/lib/api/processBoundariesApi.ts
import { supabase } from '$lib/supabaseClient';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import area from '@turf/area';
import { polygon, multiPolygon } from '@turf/helpers';
// For browser environment
const DOMParser = typeof window !== 'undefined' ? window.DOMParser : null;

// Dynamic JSZip loader
let JSZipModule;
async function getJSZip() {
    if (!JSZipModule) {
        try {
            const jszip = await import('jszip');
            JSZipModule = jszip.default || jszip;
        } catch (e) {
            console.error('Error loading JSZip:', e);
            throw new Error('Failed to load JSZip');
        }
    }
    return JSZipModule;
}

// Utility functions
function findPaddockName(properties) {
    const possibleNameFields = [
        "name", "NAME", "Name", "PaddockName",
        "PADDOCK_NAME", "paddock_name", "PADDOCKNAME", "FIELD_NAME",
        "paddock_na", "property_n", "title",
    ];
    for (const field of possibleNameFields) {
        if (properties[field]) {
            return properties[field];
        }
    }
    return null;
}

// Create a standard success response for all processors
function createSuccessResponse(paddockList, messagePrefix, additionalInfo = '') {
    // Add duplicate name handling - resolve duplicates before creating the response
    const uniquePaddockList = resolveDuplicatePaddockNames(paddockList);

    const paddockCount = uniquePaddockList.length;
    const pluralSuffix = paddockCount !== 1 ? "s" : "";

    return {
        status: "success",
        message: `Found ${paddockCount} valid paddock${pluralSuffix} in ${messagePrefix}${additionalInfo}.`,
        paddocks: uniquePaddockList,
        geojson: {
            type: "FeatureCollection",
            features: uniquePaddockList.map((paddock) => ({
                type: "Feature",
                properties: {
                    ...paddock.properties,
                    name: paddock.name,
                },
                geometry: paddock.boundary,
            })),
        },
    };
}

// Create a standard error response
function createErrorResponse(message) {
    return {
        status: "error",
        message: message
    };
}

// Process GeoJSON features into paddock objects
function processFeaturesIntoPaddocks(features) {
    const paddockList = [];
    const invalidFeatures = [];

    features.forEach((feature, index) => {
        // Skip features without geometry
        if (!feature.geometry) {
            console.warn(`Feature #${index + 1} has no geometry`);
            invalidFeatures.push({ reason: "No geometry", index });
            return;
        }

        // Skip features with unsupported geometry types
        if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') {
            console.warn(`Feature #${index + 1} has unsupported geometry type: ${feature.geometry.type}`);
            invalidFeatures.push({
                reason: "Unsupported geometry type",
                index,
                type: feature.geometry.type
            });
            return;
        }

        // Check if coordinates are valid
        if (!feature.geometry.coordinates ||
            !Array.isArray(feature.geometry.coordinates) ||
            feature.geometry.coordinates.length === 0) {
            console.warn(`Feature #${index + 1} has invalid coordinates`);
            invalidFeatures.push({
                reason: "Invalid coordinates",
                index
            });
            return;
        }

        // Calculate area using @turf/area
        let areaValue = 0;
        try {
            if (feature.geometry.type === 'Polygon') {
                areaValue = area(polygon(feature.geometry.coordinates));
            } else if (feature.geometry.type === 'MultiPolygon') {
                areaValue = area(multiPolygon(feature.geometry.coordinates));
            }

            // Convert to hectares
            const areaHectares = areaValue / 10000;

            // Skip features with too small area
            if (areaHectares < 0.001) { // Less than 10 square meters (0.001 hectares)
                console.warn(`Feature #${index + 1} has negligible area: ${areaHectares} hectares`);
                invalidFeatures.push({
                    reason: "Negligible area",
                    area: areaHectares,
                    index
                });
                return;
            }

            const properties = feature.properties || {};
            const paddockName = findPaddockName(properties) || `ImportPaddock${index + 1}`;

            // Add the calculated area to the paddock
            paddockList.push({
                name: paddockName,
                properties: properties,
                boundary: feature.geometry,
                area: areaHectares // Add the area here so it's available immediately
            });

        } catch (error) {
            console.error(`Error calculating area for feature #${index + 1}:`, error);
            invalidFeatures.push({
                reason: "Area calculation error",
                index,
                error: error.message
            });
        }
    });

    // Log information about invalid features
    if (invalidFeatures.length > 0) {
        console.warn(`Filtered out ${invalidFeatures.length} invalid features:`, invalidFeatures);
    }

    return paddockList;
}

// Helper functions for different file types
async function processKML(fileData) {
    try {
        console.log("Processing KML file...");
        const decoder = new TextDecoder("utf-8");
        const kmlContent = decoder.decode(new Uint8Array(fileData));

        const kmlDoc = new DOMParser().parseFromString(kmlContent, "text/xml");
        const geojson = kml(kmlDoc);

        const paddockList = processFeaturesIntoPaddocks(geojson.features)
            .filter((paddock) => paddock.boundary !== null);

        if (paddockList.length === 0) {
            return createErrorResponse("No valid paddocks found with boundary data in KML file.");
        }

        return createSuccessResponse(paddockList, "KML file");
    } catch (error) {
        console.error("KML processing error:", error);
        return createErrorResponse("Error processing the KML file.");
    }
}

async function processShapefile(shpData, dbfData) {
    try {
        console.log("Processing shapefile with shpjs...");
        let geojson;

        // If we have both shp and dbf data
        if (shpData && dbfData) {
            console.log("Processing with both SHP and DBF data");
            geojson = await shp({ shp: shpData, dbf: dbfData });
        } else if (shpData) {
            // Fall back to just SHP if needed
            console.log("Processing with SHP data only");
            geojson = await shp(shpData);
        } else {
            throw new Error("Invalid shapefile data");
        }

        console.log("Shapefile parsed to GeoJSON");

        // Check if we got a FeatureCollection or a single Feature
        const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];

        // Sample the first few features to see what's in them
        console.log("First feature sample:", features.length > 0 ? {
            properties: features[0].properties,
            geometryType: features[0].geometry?.type
        } : "No features");

        // Process each feature
        const paddockList = processFeaturesIntoPaddocks(features);

        // Log the paddock list to see what names were found
        console.log("Paddock names extracted:", paddockList.map(p => p.name).slice(0, 5));

        if (paddockList.length === 0) {
            return createErrorResponse("No valid paddocks found with boundary data in shapefile.");
        }

        // Log the final response to verify names are included
        const response = createSuccessResponse(paddockList, "shapefile");
        console.log("Final paddock names in response:", response.paddocks.map(p => p.name).slice(0, 5));

        return response;
    } catch (error) {
        console.error("Shapefile processing error:", error);
        return createErrorResponse(`Error processing the shapefile: ${error.message}`);
    }
}

async function processZIP(fileData) {
    try {
        console.log("Processing ZIP file...");

        // Load JSZip and extract contents
        const JSZip = await getJSZip();
        const zip = new JSZip();
        const contents = await zip.loadAsync(fileData);
        const files = Object.keys(contents.files);
        console.log("ZIP loaded, files:", files);

        // Group files by their base name (without extension)
        const fileGroups = {};
        files.forEach(file => {
            // Skip directories or hidden files
            if (file.endsWith('/') || file.startsWith('__MACOSX') || file.startsWith('.')) {
                return;
            }

            // Extract the base name (remove extension)
            const baseName = file.substring(0, file.lastIndexOf('.'));
            if (!fileGroups[baseName]) {
                fileGroups[baseName] = [];
            }
            fileGroups[baseName].push(file);
        });

        console.log("File groups detected:", Object.keys(fileGroups));

        // Check if we have multiple shapefile groups
        const shapefileGroups = Object.keys(fileGroups).filter(group => {
            const extensions = fileGroups[group].map(file => file.substring(file.lastIndexOf('.')));
            return extensions.includes('.shp');
        });

        // Process multiple shapefiles if found
        if (shapefileGroups.length > 0) {
            console.log(`Found ${shapefileGroups.length} shapefile groups`);

            // Process each shapefile group
            const allPaddocks = [];

            for (const groupName of shapefileGroups) {
                const groupFiles = fileGroups[groupName];
                const shpFileName = groupFiles.find(file => file.toLowerCase().endsWith('.shp'));
                const dbfFileName = groupFiles.find(file => file.toLowerCase().endsWith('.dbf'));

                if (shpFileName && dbfFileName) {
                    console.log(`Processing shapefile group: ${groupName}`);
                    const shpFile = await contents.file(shpFileName).async("arraybuffer");
                    const dbfFile = await contents.file(dbfFileName).async("arraybuffer");

                    const result = await processShapefile(shpFile, dbfFile);

                    if (result.status === "success") {
                        // For each paddock in this group, use paddock_na as the name if available
                        const paddocksWithCorrectNames = result.paddocks.map(paddock => {
                            // Use paddock_na field if available, otherwise use original name or groupName as fallback
                            const correctName =
                                (paddock.properties && paddock.properties.paddock_na) ||
                                (paddock.properties && paddock.properties.title) ||
                                paddock.name ||
                                "Unnamed Paddock";

                            return {
                                ...paddock,
                                name: correctName,
                                properties: {
                                    ...paddock.properties,
                                    originalFileName: groupName
                                }
                            };
                        });

                        allPaddocks.push(...paddocksWithCorrectNames);
                    }
                }
            }

            if (allPaddocks.length > 0) {
                return createSuccessResponse(
                    allPaddocks,
                    `zip file`,
                    ` containing ${shapefileGroups.length} shapefiles`
                );
            }
        }

        // Try different processing approaches if no shapefile groups

        // 1. Try using shpjs directly on ZIP
        try {
            console.log("Attempting to use shpjs directly on ZIP...");
            const geojson = await shp(fileData);
            console.log("SHP.js successfully processed the ZIP");

            const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];

            // Update the processFeaturesIntoPaddocks function call or add logic to use correct name
            const paddockList = features.map(feature => {
                // Get the correct name from feature properties
                const correctName =
                    (feature.properties && feature.properties.paddock_na) ||
                    (feature.properties && feature.properties.title) ||
                    (feature.properties && feature.properties.name) ||
                    "Unnamed Paddock";

                return {
                    name: correctName,
                    properties: feature.properties,
                    boundary: feature.geometry,
                    area: calculateArea(feature.geometry)
                };
            });

            if (paddockList.length > 0) {
                return createSuccessResponse(paddockList, "zip file (shapefile)");
            }
        } catch (err) {
            console.log("Direct shpjs processing failed, trying alternatives:", err);
        }

        // 2. Check for individual files inside the ZIP

        // Look for shapefile
        const shpFileName = files.find(file => file.toLowerCase().endsWith(".shp"));
        const dbfFileName = files.find(file => file.toLowerCase().endsWith(".dbf"));
        if (shpFileName) {
            console.log("Found individual shapefile components");
            const shpFile = await contents.file(shpFileName).async("arraybuffer");
            const dbfFile = dbfFileName ? await contents.file(dbfFileName).async("arraybuffer") : null;

            // Process the shapefile and then fix the names
            const result = await processShapefile(shpFile, dbfFile);

            // If successful, update the paddock names using paddock_na
            if (result.status === "success" && result.paddocks) {
                result.paddocks = result.paddocks.map(paddock => {
                    const correctName =
                        (paddock.properties && paddock.properties.paddock_na) ||
                        (paddock.properties && paddock.properties.title) ||
                        paddock.name ||
                        "Unnamed Paddock";

                    return {
                        ...paddock,
                        name: correctName
                    };
                });
            }

            return result;
        }

        // Look for KML
        const kmlFileName = files.find(file => file.toLowerCase().endsWith(".kml"));
        if (kmlFileName) {
            console.log("Found KML file in ZIP");
            const kmlFileContent = await contents.file(kmlFileName).async("arraybuffer");
            return processKML(kmlFileContent);
        }

        // Look for XML
        const xmlFileName = files.find(file => file.toLowerCase().endsWith(".xml"));
        if (xmlFileName) {
            console.log("Found XML file in ZIP");
            const xmlContent = await contents.file(xmlFileName).async("text");
            return processISOXML(xmlContent);
        }

        return createErrorResponse("No valid data files found in the zip archive.");
    } catch (error) {
        console.error("ZIP processing error:", error);
        return createErrorResponse(`Error processing the zip file: ${error.message}`);
    }
}

function processISOXML(xmlContent) {
    try {
        console.log("Processing ISOXML file...");
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

        // Check if it's a valid ISOXML file
        const isoxml = xmlDoc.getElementsByTagName("ISO11783_TaskData")[0];
        if (!isoxml) {
            return createErrorResponse("Not a valid ISOXML file.");
        }

        const paddockList = [];
        let totalExclusions = 0;

        // Process client (CTR element)
        const ctr = xmlDoc.getElementsByTagName("CTR")[0];
        const client = ctr ? ctr.getAttribute("B") : "Unknown Client";

        // Process farms (FRM elements)
        const farms = xmlDoc.getElementsByTagName("FRM");
        const farmMap = new Map();
        for (let i = 0; i < farms.length; i++) {
            const farm = farms[i];
            const farmId = farm.getAttribute("A");
            const farmName = farm.getAttribute("B");
            farmMap.set(farmId, farmName);
        }

        // Process partfields (paddocks)
        const partfields = xmlDoc.getElementsByTagName("PFD");
        for (let i = 0; i < partfields.length; i++) {
            const partfield = partfields[i];
            const paddockId = partfield.getAttribute("A");
            const paddockName = partfield.getAttribute("C") || `ImportPaddock${i + 1}`;
            const areaValue = partfield.getAttribute("D");
            const farmId = partfield.getAttribute("F");
            const farm = farmMap.get(farmId) || "Unknown Farm";

            // Modified approach - create a map to organize polygons by type
            const mainPolygons = [];
            const obstacleMap = new Map(); // Map to track which obstacles belong to which main polygon

            // Process polygons for this partfield
            const polygons = partfield.getElementsByTagName("PLN");

            // First pass - identify main polygons and obstacles
            for (let j = 0; j < polygons.length; j++) {
                const polygon = polygons[j];
                const polygonType = polygon.getAttribute("A");
                const polygonName = polygon.getAttribute("B") || "";

                const lineStrings = polygon.getElementsByTagName("LSG");
                let ringCoordinates = [];

                // Extract coordinates from the first LSG (assuming each PLN has at least one LSG)
                if (lineStrings.length > 0) {
                    const lsg = lineStrings[0];
                    const points = lsg.getElementsByTagName("PNT");

                    for (let l = 0; l < points.length; l++) {
                        const point = points[l];
                        const lat = parseFloat(point.getAttribute("C"));
                        const lon = parseFloat(point.getAttribute("D"));
                        ringCoordinates.push([lon, lat]);
                    }

                    // Close the ring
                    if (ringCoordinates.length > 0) {
                        ringCoordinates.push(ringCoordinates[0]);
                    }
                }

                // Skip empty polygons
                if (ringCoordinates.length === 0) continue;

                // Determine if it's a main polygon or an obstacle based on attributes
                // Type "1" is usually a main polygon, Type "8" often indicates obstacles/exclusions
                // Also check if the name includes "Obstacle" or similar words
                const isObstacle =
                    polygonType === "8" ||
                    polygonName.toLowerCase().includes("obstacle") ||
                    polygonName.toLowerCase().includes("exclusion");

                if (isObstacle) {
                    // This is likely an obstacle/hole
                    // Initially we'll put it in a list, then later assign it to the main polygon
                    let parentPolygonIndex = 0; // Default to first polygon if we can't determine

                    // For now, we'll add it to the obstacle map with the parent polygon index
                    // We'll assign it to the correct parent polygon in the second pass
                    if (!obstacleMap.has(parentPolygonIndex)) {
                        obstacleMap.set(parentPolygonIndex, []);
                    }
                    obstacleMap.get(parentPolygonIndex).push(ringCoordinates);
                    totalExclusions++;
                } else {
                    // This is a main polygon
                    mainPolygons.push([ringCoordinates]);
                }
            }

            // Special case handling: If we have obstacles without clear parent assignment
            // Use geometric containment to determine which main polygon they belong to
            if (obstacleMap.has(0) && mainPolygons.length > 1) {
                // This is where we'd implement the containment check, but it requires turf.js
                // For now, we'll use a simplified approach - assign obstacles to the first polygon
                // TODO: Implement proper containment check with turf.js if available
            }

            // Assign obstacles to their respective main polygons
            obstacleMap.forEach((obstacles, parentIndex) => {
                if (parentIndex < mainPolygons.length) {
                    // Add all obstacles as inner rings of the main polygon
                    obstacles.forEach(obstacle => {
                        mainPolygons[parentIndex].push(obstacle);
                    });
                }
            });

            // Create final boundary representation
            if (mainPolygons.length > 0) {
                // Create a paddock object
                const paddock = {
                    name: paddockName,
                    properties: {
                        id: paddockId,
                        area: areaValue,
                        farmId: farmId,
                        client: client,
                        farm: farm,
                    },
                    boundary: {
                        type: mainPolygons.length > 1 ? "MultiPolygon" : "Polygon",
                        coordinates:
                            mainPolygons.length > 1
                                ? mainPolygons
                                : mainPolygons[0],
                    },
                };

                paddockList.push(paddock);
            }
        }

        if (paddockList.length === 0) {
            return createErrorResponse("No valid paddocks found with boundary data in ISOXML file.");
        }

        const exclusionText = totalExclusions > 0
            ? ` with a total of ${totalExclusions} exclusion${totalExclusions !== 1 ? "s" : ""}`
            : '';

        return createSuccessResponse(paddockList, "ISOXML file", exclusionText);
    } catch (error) {
        console.error("ISOXML processing error:", error);
        return createErrorResponse("Error processing the ISOXML file.");
    }
}


/**
 * Resolves duplicate paddock names by adding a numeric suffix to ensure uniqueness
 * @param paddocks Array of paddocks with name properties
 * @returns Array of paddocks with unique names
 */
function resolveDuplicatePaddockNames(paddocks) {
    // Use a map to keep track of which names we've seen
    const nameCount = new Map();

    return paddocks.map(paddock => {
        const originalName = paddock.name;

        // Skip if no name or null
        if (!originalName) return paddock;

        // Update count for this name
        const count = (nameCount.get(originalName) || 0) + 1;
        nameCount.set(originalName, count);

        // If this is the first occurrence, keep the original name
        if (count === 1) return paddock;

        // Otherwise, add a suffix
        const uniqueName = `${originalName} #${count}`;
        console.log(`Renamed duplicate paddock from "${originalName}" to "${uniqueName}"`);

        return {
            ...paddock,
            name: uniqueName,
            properties: {
                ...paddock.properties,
                originalName // Keep the original name in properties
            }
        };
    });
}

// TODO: Future improvement - implement geometric overlap detection
// to identify true duplicates by checking if field boundaries overlap significantly
// rather than just comparing names. This would avoid renaming fields that
// just happen to have the same name but are in different locations.

// The main API object
export const processBoundariesApi = {
    async processFile(fileName: string) {
        try {
            console.log("Starting processing of file:", fileName);

            // Authentication check
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }
            const userId = session.session.user.id;

            if (!fileName) {
                throw new Error("File name is required");
            }

            // Construct file path and download
            const filePath = `user_${userId}/${fileName}`;
            console.log("File path:", filePath);

            const { data, error: downloadError } = await supabase.storage
                .from("user_files_bucket")
                .download(filePath);

            if (downloadError) {
                console.error("Download error:", downloadError);
                throw new Error(`Download error: ${downloadError.message}`);
            }

            if (!data) {
                console.error("No data received from download");
                throw new Error("File not found");
            }

            console.log("File downloaded successfully, size:", data.size);

            // Convert Blob to ArrayBuffer
            const arrayBuffer = await data.arrayBuffer();

            // Process based on file extension
            const fileExtension = fileName.split(".").pop().toLowerCase();
            console.log("Processing file with extension:", fileExtension);

            let result;
            switch (fileExtension) {
                case "kml":
                    result = await processKML(arrayBuffer);
                    break;
                case "zip":
                    result = await processZIP(arrayBuffer);
                    break;
                case "xml":
                    const decoder = new TextDecoder("utf-8");
                    const xmlContent = decoder.decode(new Uint8Array(arrayBuffer));
                    result = processISOXML(xmlContent);
                    break;
                default:
                    result = createErrorResponse("Invalid file type. Please upload a zip, KML, or XML file.");
                    break;
            }

            console.log("Processing result status:", result.status);
            if (result.status === "error") {
                throw new Error(result.message);
            }

            // More detailed logging before creating the response
            console.log("Result before final return:", {
                messageType: typeof result.message,
                hasError: !!result.error,
                paddockCount: result.paddocks?.length || 0,
                paddockStructure: result.paddocks && result.paddocks.length > 0
                    ? Object.keys(result.paddocks[0])
                    : 'No paddocks',
                firstFewNames: result.paddocks?.slice(0, 5).map(p => p.name),
                geojsonFeatureCount: result.geojson?.features?.length || 0
            });

            // Inspect the first paddock in detail
            if (result.paddocks && result.paddocks.length > 0) {
                const firstPaddock = result.paddocks[0];
                console.log("First paddock detailed info:", {
                    name: firstPaddock.name,
                    nameType: typeof firstPaddock.name,
                    hasNameProperty: 'name' in firstPaddock,
                    boundaryType: firstPaddock.boundary?.type,
                    propertyKeys: Object.keys(firstPaddock),
                    allProperties: firstPaddock.properties ? Object.keys(firstPaddock.properties) : 'No properties'
                });
            }

            // Compare with GeoJSON if available
            if (result.geojson?.features && result.geojson.features.length > 0) {
                console.log("First GeoJSON feature detailed info:", {
                    properties: result.geojson.features[0].properties,
                    nameInProperties: result.geojson.features[0].properties?.name,
                    geometryType: result.geojson.features[0].geometry?.type
                });
            }

            // Final response check
            const response = {
                message: result.message,
                paddocks: result.paddocks || [],
                geojson: result.geojson,
            };

            console.log("API final response structure:", {
                messageType: typeof response.message,
                paddockCount: response.paddocks?.length || 0,
                paddocksHaveNames: response.paddocks ?
                    response.paddocks.every(p => p.name && p.name !== "boundaries") : false,
                firstPaddockKeysDetailed: response.paddocks && response.paddocks.length > 0 ?
                    Object.entries(response.paddocks[0]).map(([key, value]) =>
                        `${key}: ${typeof value} (${value && typeof value === 'object' ? 'object' : String(value)})`) : [],
                geojsonFeatureCount: response.geojson?.features?.length || 0,
                firstFewPaddockNames: response.paddocks?.slice(0, 5).map(p => p.name)
            });

            return response;
        } catch (error) {
            console.error("Error in processFile:", error);
            return {
                error: true,
                message: error.message || "An error occurred while processing the file"
            };
        }
    }
};