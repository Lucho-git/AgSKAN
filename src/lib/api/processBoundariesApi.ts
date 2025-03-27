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
    const paddockCount = paddockList.length;
    const pluralSuffix = paddockCount !== 1 ? "s" : "";

    return {
        status: "success",
        message: `Found ${paddockCount} valid paddock${pluralSuffix} in ${messagePrefix}${additionalInfo}.`,
        paddocks: paddockList,
        geojson: {
            type: "FeatureCollection",
            features: paddockList.map((paddock) => ({
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

        // Process each feature
        const paddockList = processFeaturesIntoPaddocks(features);

        if (paddockList.length === 0) {
            return createErrorResponse("No valid paddocks found with boundary data in shapefile.");
        }

        return createSuccessResponse(paddockList, "shapefile");
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
                        // For each paddock in this group, update name based on the group name
                        const paddocksWithGroupName = result.paddocks.map(paddock => {
                            // Extract the last segment of the group name as the paddock name
                            const nameParts = groupName.split(/[\/\\-]/);
                            const suggestedName = nameParts[nameParts.length - 1].trim();

                            return {
                                ...paddock,
                                name: suggestedName || paddock.name,
                                properties: {
                                    ...paddock.properties,
                                    originalFileName: groupName
                                }
                            };
                        });

                        allPaddocks.push(...paddocksWithGroupName);
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
            const paddockList = processFeaturesIntoPaddocks(features);

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
            return processShapefile(shpFile, dbfFile);
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

            // Process polygons for this partfield
            const polygons = partfield.getElementsByTagName("PLN");
            let boundaryCoordinates = [];

            for (let j = 0; j < polygons.length; j++) {
                const polygon = polygons[j];
                const lineStrings = polygon.getElementsByTagName("LSG");
                let polygonCoordinates = [];

                for (let k = 0; k < lineStrings.length; k++) {
                    const lsg = lineStrings[k];
                    const lsgType = lsg.getAttribute("A");
                    const points = lsg.getElementsByTagName("PNT");
                    const ringCoordinates = [];

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

                    if (lsgType === "1") {
                        // Main boundary
                        polygonCoordinates.unshift(ringCoordinates);
                    } else if (lsgType === "2") {
                        // Exclusion
                        polygonCoordinates.push(ringCoordinates);
                        totalExclusions++;
                    }
                }

                if (polygonCoordinates.length > 0) {
                    boundaryCoordinates.push(polygonCoordinates);
                }
            }

            if (boundaryCoordinates.length > 0) {
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
                        type: boundaryCoordinates.length > 1 ? "MultiPolygon" : "Polygon",
                        coordinates:
                            boundaryCoordinates.length > 1
                                ? boundaryCoordinates
                                : boundaryCoordinates[0],
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

            return {
                message: result.message,
                paddocks: result.paddocks || [],
                geojson: result.geojson,
            };
        } catch (error) {
            console.error("Error in processFile:", error);
            return {
                error: true,
                message: error.message || "An error occurred while processing the file"
            };
        }
    }
};