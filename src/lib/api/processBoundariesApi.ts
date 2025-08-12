// src/lib/api/processBoundariesApi.ts
import { supabase } from '$lib/supabaseClient';
import shp from 'shpjs'; // Assuming shpjs default export is the function
import { kml } from '@tmcw/togeojson';
import area from '@turf/area';
import { polygon, multiPolygon } from '@turf/helpers';

// For browser environment
const BrowserDOMParser = typeof window !== 'undefined' ? window.DOMParser : null;

if (!BrowserDOMParser) {
    console.error("DOMParser not found. This script is intended for browser environments.");
    // You might throw an error here or have a fallback if truly needed,
    // but for client-side only, it should always be available.
}

// Dynamic JSZip loader
let JSZipModule: any; // Using 'any' for simplicity, replace with actual type if known
async function getJSZip() {
    if (!JSZipModule) {
        try {
            const jszip = await import('jszip');
            JSZipModule = jszip.default || jszip; // Handle both default and non-default exports
        } catch (e) {
            console.error('Error loading JSZip:', e);
            throw new Error('Failed to load JSZip');
        }
    }
    return JSZipModule;
}

// Utility functions
function findPaddockName(properties: any): string | null {
    const possibleNameFields = [
        "name", "NAME", "Name", "PaddockName",
        "PADDOCK_NAME", "paddock_name", "PADDOCKNAME", "FIELD_NAME",
        "paddock_na", "property_n", "title", "FIELDNAME"
    ];
    for (const field of possibleNameFields) {
        if (properties && properties[field]) {
            return String(properties[field]);
        }
    }
    return null;
}

// Create a standard success response for all processors
function createSuccessResponse(paddockList: any[], messagePrefix: string, additionalInfo: string = '') {
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
function createErrorResponse(message: string) {
    return {
        status: "error",
        message: message
    };
}

// Process GeoJSON features into paddock objects
function processFeaturesIntoPaddocks(features: any[], sourceFileInfo: { type: string, name?: string } = { type: 'unknown' }): any[] {
    // console.log(`Beginning to process ${features.length} features into paddocks from ${sourceFileInfo.type} (${sourceFileInfo.name || ''})`);
    const paddockList = [];
    const invalidFeatures = [];

    features.forEach((feature, index) => {
        const featureIdentifier = findPaddockName(feature.properties) || `Unnamed Feature ${index + 1} from ${sourceFileInfo.name || sourceFileInfo.type}`;

        if (!feature.geometry) {
            invalidFeatures.push({ reason: "No geometry", index, name: featureIdentifier });
            return;
        }

        if (feature.geometry.type === 'GeometryCollection') {
            const validGeometry = feature.geometry.geometries?.find(geom =>
                geom.type === 'Polygon' || geom.type === 'MultiPolygon');

            if (!validGeometry) {
                invalidFeatures.push({
                    reason: "No valid polygons in GeometryCollection",
                    index,
                    name: featureIdentifier
                });
                return;
            }
            feature.geometry = validGeometry;
        }

        if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') {
            invalidFeatures.push({
                reason: "Unsupported geometry type",
                index,
                type: feature.geometry.type,
                name: featureIdentifier
            });
            return;
        }

        if (!feature.geometry.coordinates ||
            !Array.isArray(feature.geometry.coordinates) ||
            feature.geometry.coordinates.length === 0) {
            invalidFeatures.push({ reason: "Invalid coordinates", index, name: featureIdentifier });
            return;
        }

        let areaValue = 0;
        let polygonAreas = null;

        try {
            if (feature.geometry.type === 'Polygon') {
                const turfGeometry = polygon(feature.geometry.coordinates);
                areaValue = area(turfGeometry);
            } else if (feature.geometry.type === 'MultiPolygon') {
                const turfGeometry = multiPolygon(feature.geometry.coordinates);
                areaValue = area(turfGeometry); // Total area

                // Calculate individual polygon areas
                const individualAreas = feature.geometry.coordinates.map(polygonCoords => {
                    const polygonArea = area(polygon(polygonCoords)) / 10000;
                    return Math.round(polygonArea * 100) / 100; // Round to 2 decimal places
                });

                polygonAreas = {
                    individual_areas: individualAreas,
                    total_area: Math.round((areaValue / 10000) * 100) / 100 // Also round total to 2 decimal places
                };
            }

            const areaHectares = areaValue / 10000;

            if (areaHectares < 0.001) { // Less than 10 square meters
                invalidFeatures.push({
                    reason: "Negligible area",
                    area: areaHectares,
                    index,
                    name: featureIdentifier
                });
                return;
            }

            const properties = feature.properties || {};
            const paddockName = findPaddockName(properties) || `ImportPaddock_${sourceFileInfo.type}_${paddockList.length + 1}`;

            const paddockData = {
                name: paddockName,
                properties: properties,
                boundary: feature.geometry,
                area: areaHectares
            };

            // Add polygon_areas only for multipolygons
            if (polygonAreas) {
                paddockData.polygon_areas = polygonAreas;
            }

            paddockList.push(paddockData);

        } catch (error: any) {
            console.error(`Error calculating area for feature (Name: ${featureIdentifier}):`, error);
            invalidFeatures.push({
                reason: "Area calculation error",
                index,
                name: featureIdentifier,
                error: error.message
            });
        }
    });

    if (invalidFeatures.length > 0) {
        console.warn(`Filtered out ${invalidFeatures.length} invalid features from ${sourceFileInfo.type} (${sourceFileInfo.name || ''}):`, invalidFeatures.map(f => ({ name: f.name, reason: f.reason, type: f.type, area: f.area })));
    }
    // console.log(`Successfully processed ${paddockList.length} valid paddocks from ${sourceFileInfo.type} (${sourceFileInfo.name || ''})`);
    return paddockList;
}


async function processKML(fileData: ArrayBuffer, kmlFileNameForContext: string = "KML"): Promise<any> {
    try {
        if (!BrowserDOMParser) {
            return createErrorResponse("DOMParser is not available in this environment. Cannot process KML.");
        }
        // console.log(`Processing KML file: ${kmlFileNameForContext}`);
        const decoder = new TextDecoder("utf-8");
        const kmlContent = decoder.decode(new Uint8Array(fileData));

        const parser = new BrowserDOMParser();
        const kmlDoc = parser.parseFromString(kmlContent, "text/xml");

        const errorNode = kmlDoc.getElementsByTagName("parsererror")[0];
        if (errorNode) {
            console.error("KML parsing error:", errorNode.textContent);
            return createErrorResponse(`Error parsing KML file (${kmlFileNameForContext}): Invalid XML structure.`);
        }

        const geojson = kml(kmlDoc); // @tmcw/togeojson

        if (geojson.features) {
            geojson.features.forEach((feature: any) => {
                if (!feature.geometry) return;
                const geomType = feature.geometry.type;
                let coords = feature.geometry.coordinates;

                try {
                    if (geomType === 'Polygon') {
                        feature.geometry.coordinates = coords.map((ring: any[]) =>
                            ring.map((coord: any[]) => [coord[0], coord[1]]));
                    } else if (geomType === 'MultiPolygon') {
                        feature.geometry.coordinates = coords.map((polygon: any[][]) =>
                            polygon.map((ring: any[]) =>
                                ring.map((coord: any[]) => [coord[0], coord[1]])));
                    } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
                        feature.geometry.coordinates = coords.map((coord: any[]) => [coord[0], coord[1]]);
                    } else if (geomType === 'MultiLineString') {
                        feature.geometry.coordinates = coords.map((line: any[][]) =>
                            line.map((coord: any[]) => [coord[0], coord[1]]));
                    } else if (geomType === 'Point') {
                        feature.geometry.coordinates = [coords[0], coords[1]];
                    }
                } catch (e) {
                    // console.warn(`Could not strip Z from coordinates for ${geomType} in ${kmlFileNameForContext}`, e);
                }
            });
        }

        const featuresToProcess = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);
        const paddockList = processFeaturesIntoPaddocks(featuresToProcess, { type: 'KML', name: kmlFileNameForContext })
            .filter((paddock) => paddock.boundary !== null);

        if (paddockList.length === 0) {
            return createErrorResponse(`No valid paddocks found with boundary data in KML file (${kmlFileNameForContext}).`);
        }
        return createSuccessResponse(paddockList, `KML file (${kmlFileNameForContext})`);
    } catch (error: any) {
        console.error(`KML processing error for ${kmlFileNameForContext}:`, error);
        return createErrorResponse(`Error processing KML file (${kmlFileNameForContext}): ${error.message}`);
    }
}

async function processShapefile(shpData: ArrayBuffer, dbfData: ArrayBuffer | null, shpFileNameForContext: string = "Shapefile"): Promise<any> {
    try {
        // console.log(`Processing shapefile: ${shpFileNameForContext}`);
        let geojson: any;
        const shpOptions: any = { shp: shpData };
        if (dbfData) {
            shpOptions.dbf = dbfData;
        }
        geojson = await shp(shpOptions);

        const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];
        const paddockList = processFeaturesIntoPaddocks(features, { type: 'Shapefile', name: shpFileNameForContext });

        if (paddockList.length === 0) {
            return createErrorResponse(`No valid paddocks found with boundary data in shapefile (${shpFileNameForContext}).`);
        }
        return createSuccessResponse(paddockList, `shapefile (${shpFileNameForContext})`);
    } catch (error: any) {
        console.error(`Shapefile processing error for ${shpFileNameForContext}:`, error);
        return createErrorResponse(`Error processing the shapefile (${shpFileNameForContext}): ${error.message}`);
    }
}

async function processZIP(fileData: ArrayBuffer): Promise<any> {
    try {
        console.log("Processing ZIP file...");
        const JSZip = await getJSZip();
        const zip = new JSZip();
        const contents = await zip.loadAsync(fileData);

        const filesInZip = Object.keys(contents.files).filter(
            fileName => !contents.files[fileName].dir &&
                !fileName.startsWith('__MACOSX') &&
                !fileName.startsWith('.') &&
                !fileName.includes('/.')
        );
        console.log("ZIP loaded, valid files:", filesInZip);

        // --- Multiple KML Processing Logic ---
        const kmlFileNames = filesInZip.filter(file => file.toLowerCase().endsWith(".kml"));
        if (kmlFileNames.length > 0) {
            console.log(`Found ${kmlFileNames.length} KML file(s) in ZIP. Processing them individually.`);
            const allKmlPaddocks: any[] = [];
            let kmlFilesProcessedSuccessfully = 0;

            for (const kmlFileName of kmlFileNames) {
                try {
                    const kmlFileContent = await contents.file(kmlFileName)!.async("arraybuffer");
                    const kmlResult = await processKML(kmlFileContent, kmlFileName); // Pass kmlFileName for context

                    if (kmlResult.status === "success" && kmlResult.paddocks && kmlResult.paddocks.length > 0) {
                        const kmlBaseName = kmlFileName.substring(0, kmlFileName.lastIndexOf('.'));
                        kmlResult.paddocks.forEach((paddock: any) => {
                            paddock.properties = {
                                ...paddock.properties,
                                originalFileName: paddock.properties?.originalFileName || kmlBaseName,
                                sourceType: 'KML_from_ZIP'
                            };
                        });
                        allKmlPaddocks.push(...kmlResult.paddocks);
                        kmlFilesProcessedSuccessfully++;
                    } else if (kmlResult.status === "error") {
                        console.warn(`KML file ${kmlFileName} in ZIP processed with error: ${kmlResult.message}`);
                    }
                } catch (kmlError: any) {
                    console.error(`Error processing KML file ${kmlFileName} from ZIP:`, kmlError.message);
                }
            }

            if (allKmlPaddocks.length > 0) {
                return createSuccessResponse(
                    allKmlPaddocks,
                    `zip file`,
                    ` containing data from ${kmlFilesProcessedSuccessfully} KML file(s)`
                );
            } else if (kmlFileNames.length > 0 && allKmlPaddocks.length === 0) {
                return createErrorResponse("ZIP contained KML file(s), but no valid paddock data could be extracted from them.");
            }
        }

        console.log("No KML files found or they yielded no data in ZIP, checking for other formats...");

        // Shapefile group processing
        const fileGroups: { [key: string]: string[] } = {};
        filesInZip.forEach(file => {
            const baseName = file.substring(0, file.lastIndexOf('.'));
            if (!fileGroups[baseName]) fileGroups[baseName] = [];
            fileGroups[baseName].push(file);
        });

        const shapefileGroups = Object.keys(fileGroups).filter(group =>
            fileGroups[group].some(file => file.toLowerCase().endsWith('.shp'))
        );

        if (shapefileGroups.length > 0) {
            console.log(`Found ${shapefileGroups.length} shapefile group(s) in ZIP.`);
            const allShapefilePaddocks: any[] = [];
            let shapefileGroupsProcessedSuccessfully = 0;

            for (const groupName of shapefileGroups) {
                const groupFiles = fileGroups[groupName];
                const shpFileName = groupFiles.find(f => f.toLowerCase().endsWith('.shp'));
                const dbfFileName = groupFiles.find(f => f.toLowerCase().endsWith('.dbf'));

                if (shpFileName) {
                    try {
                        const shpFileBuffer = await contents.file(shpFileName)!.async("arraybuffer");
                        const dbfFileBuffer = dbfFileName ? await contents.file(dbfFileName)!.async("arraybuffer") : null;
                        const result = await processShapefile(shpFileBuffer, dbfFileBuffer, groupName); // Pass groupName for context

                        if (result.status === "success" && result.paddocks && result.paddocks.length > 0) {
                            result.paddocks.forEach((paddock: any) => {
                                paddock.properties = {
                                    ...paddock.properties,
                                    originalFileName: paddock.properties?.originalFileName || groupName,
                                    sourceType: 'ShapefileGroup_from_ZIP'
                                };
                            });
                            allShapefilePaddocks.push(...result.paddocks);
                            shapefileGroupsProcessedSuccessfully++;
                        } else if (result.status === "error") {
                            console.warn(`Shapefile group ${groupName} in ZIP processed with error: ${result.message}`);
                        }
                    } catch (shpGroupError: any) {
                        console.error(`Error processing shapefile group ${groupName} from ZIP:`, shpGroupError.message);
                    }
                }
            }
            if (allShapefilePaddocks.length > 0) {
                return createSuccessResponse(
                    allShapefilePaddocks,
                    `zip file`,
                    ` containing data from ${shapefileGroupsProcessedSuccessfully} shapefile group(s)`
                );
            }
            if (shapefileGroups.length > 0 && allShapefilePaddocks.length === 0) {
                console.log("Shapefile groups were found in ZIP but yielded no paddocks. Continuing search...");
            }
        }

        // Try shpjs directly on the entire ZIP
        try {
            console.log("Attempting to use shpjs directly on the entire ZIP (for shapefile ZIP)...");
            const geojson = await shp(fileData);
            const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];
            const paddockList = processFeaturesIntoPaddocks(features, { type: 'Shapefile_from_ZIP_direct' });

            if (paddockList.length > 0) {
                paddockList.forEach((paddock: any) => {
                    paddock.properties = { ...paddock.properties, sourceType: 'Shapefile_from_ZIP_direct' };
                });
                return createSuccessResponse(paddockList, "zip file (processed as shapefile archive)");
            }
        } catch (err: any) {
            console.log("Direct shpjs processing of ZIP failed (likely not a shapefile ZIP), trying alternatives: ", err.message);
        }

        // Check for individual ISOXML file
        const xmlFileName = filesInZip.find(file => file.toLowerCase().endsWith(".xml"));
        if (xmlFileName) {
            try {
                console.log("Found XML file in ZIP, attempting to process as ISOXML:", xmlFileName);
                const xmlFileContent = await contents.file(xmlFileName)!.async("text");
                const xmlResult = await processISOXML(xmlFileContent, xmlFileName); // Pass xmlFileName for context

                if (xmlResult.status === "success" && xmlResult.paddocks && xmlResult.paddocks.length > 0) {
                    const xmlBaseName = xmlFileName.substring(0, xmlFileName.lastIndexOf('.'));
                    xmlResult.paddocks.forEach((paddock: any) => {
                        paddock.properties = {
                            ...paddock.properties,
                            originalFileName: paddock.properties?.originalFileName || xmlBaseName,
                            sourceType: 'ISOXML_from_ZIP'
                        };
                    });
                    return xmlResult;
                }
            } catch (xmlError: any) {
                console.error(`Error processing XML file ${xmlFileName} from ZIP:`, xmlError.message);
            }
        }

        return createErrorResponse("No valid KML, Shapefile, or ISOXML data found in the zip archive that could be processed.");

    } catch (error: any) {
        console.error("Outer ZIP processing error:", error);
        return createErrorResponse(`Error processing the zip file: ${error.message}`);
    }
}

async function processISOXML(xmlContent: string, xmlFileNameForContext: string = "ISOXML"): Promise<any> {
    try {
        if (!BrowserDOMParser) {
            return createErrorResponse("DOMParser is not available in this environment. Cannot process ISOXML.");
        }
        // console.log(`Processing ISOXML file: ${xmlFileNameForContext}`);
        const parser = new BrowserDOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "application/xml");

        const errorNode = xmlDoc.getElementsByTagName("parsererror")[0];
        if (errorNode) {
            console.error("ISOXML parsing error:", errorNode.textContent);
            return createErrorResponse(`Error parsing ISOXML file (${xmlFileNameForContext}): Invalid XML structure.`);
        }

        const isoxml = xmlDoc.getElementsByTagName("ISO11783_TaskData")[0];
        if (!isoxml) {
            return createErrorResponse(`Not a valid ISOXML file (${xmlFileNameForContext}): Missing ISO11783_TaskData root element.`);
        }

        const paddockList: any[] = [];
        let totalExclusions = 0;

        const ctr = xmlDoc.getElementsByTagName("CTR")[0];
        const client = ctr ? ctr.getAttribute("B") : "Unknown Client";

        const farms = xmlDoc.getElementsByTagName("FRM");
        const farmMap = new Map();
        for (let i = 0; i < farms.length; i++) {
            farmMap.set(farms[i].getAttribute("A"), farms[i].getAttribute("B"));
        }

        const partfields = xmlDoc.getElementsByTagName("PFD");
        for (let i = 0; i < partfields.length; i++) {
            const partfield = partfields[i];
            const paddockId = partfield.getAttribute("A");
            const paddockName = partfield.getAttribute("C") || `ImportPaddock_ISOXML_${i + 1}`;
            const areaValue = partfield.getAttribute("D");
            const farmId = partfield.getAttribute("F");
            const farm = farmMap.get(farmId) || "Unknown Farm";

            const pfdPolygons = partfield.getElementsByTagName("PLN");
            const geometricPolygons: any[][][] = [];

            for (let j = 0; j < pfdPolygons.length; j++) {
                const pln = pfdPolygons[j];
                const polygonType = pln.getAttribute("A");
                const lineStrings = pln.getElementsByTagName("LSG");
                if (lineStrings.length === 0) continue;

                const ringCoordinates: any[] = [];
                const points = lineStrings[0].getElementsByTagName("PNT");
                for (let l = 0; l < points.length; l++) {
                    const lat = parseFloat(points[l].getAttribute("C")!);
                    const lon = parseFloat(points[l].getAttribute("D")!);
                    ringCoordinates.push([lon, lat]);
                }

                if (ringCoordinates.length > 3 &&
                    (ringCoordinates[0][0] !== ringCoordinates[ringCoordinates.length - 1][0] ||
                        ringCoordinates[0][1] !== ringCoordinates[ringCoordinates.length - 1][1])) {
                    ringCoordinates.push([...ringCoordinates[0]]);
                }

                if (ringCoordinates.length < 4) continue;

                if (polygonType === "1") {
                    geometricPolygons.unshift([ringCoordinates]);
                } else if (polygonType === "8") {
                    if (geometricPolygons.length === 0) geometricPolygons.push([]);
                    geometricPolygons[0].push(ringCoordinates);
                    totalExclusions++;
                }
            }

            if (geometricPolygons.length > 0 && geometricPolygons[0].length > 0) {
                const boundaryGeoJSON = {
                    type: "Polygon",
                    coordinates: geometricPolygons[0]
                };

                let areaHectares = 0;
                if (areaValue) {
                    areaHectares = parseFloat(areaValue) / 10000;
                } else {
                    try { areaHectares = area(polygon(boundaryGeoJSON.coordinates as any)) / 10000; } catch (e) {/* ignore */ }
                }

                if (areaHectares < 0.001 && areaValue) { /* respect tiny area from XML */ }
                else if (areaHectares < 0.001) continue;

                paddockList.push({
                    name: paddockName,
                    properties: { id: paddockId, farmId: farmId, client: client, farm: farm, originalAreaSQM: areaValue, sourceType: 'ISOXML', originalFileName: xmlFileNameForContext },
                    boundary: boundaryGeoJSON,
                    area: areaHectares
                });
            }
        }

        if (paddockList.length === 0) {
            return createErrorResponse(`No valid paddocks found with boundary data in ISOXML file (${xmlFileNameForContext}).`);
        }
        const exclusionText = totalExclusions > 0 ? ` with ${totalExclusions} exclusion(s)` : '';
        return createSuccessResponse(paddockList, `ISOXML file (${xmlFileNameForContext})`, exclusionText);
    } catch (error: any) {
        console.error(`ISOXML processing error for ${xmlFileNameForContext}:`, error);
        return createErrorResponse(`Error processing the ISOXML file (${xmlFileNameForContext}): ${error.message}`);
    }
}


function resolveDuplicatePaddockNames(paddocks: any[]): any[] {
    const nameCount = new Map();
    return paddocks.map(paddock => {
        let currentName = paddock.name || "Unnamed Paddock";
        const originalNameForLookup = currentName;
        let count = (nameCount.get(originalNameForLookup) || 0) + 1;
        nameCount.set(originalNameForLookup, count);

        if (count > 1) {
            currentName = `${originalNameForLookup} (${count})`;
        }

        return {
            ...paddock,
            name: currentName,
            properties: {
                ...paddock.properties,
                originalName: (count > 1 && !paddock.properties?.originalName) ? originalNameForLookup : paddock.properties?.originalName,
            }
        };
    });
}

export const processBoundariesApi = {
    async processFile(fileName: string): Promise<any> {
        try {
            console.log("Starting client-side processing of file:", fileName);

            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session?.user) {
                return createErrorResponse("Not authenticated. Please log in.");
            }
            const userId = sessionData.session.user.id;

            if (!fileName) {
                return createErrorResponse("File name is required.");
            }

            const filePath = `user_${userId}/${fileName}`;
            console.log("Attempting to download file from Supabase Storage:", filePath);

            const { data: blobData, error: downloadError } = await supabase.storage
                .from("user_files_bucket")
                .download(filePath);

            if (downloadError) {
                console.error("Supabase download error:", downloadError);
                throw new Error(`Download error from cloud storage: ${downloadError.message}`);
            }
            if (!blobData) {
                throw new Error("File not found or empty in cloud storage.");
            }

            console.log("File downloaded successfully from Supabase, size:", blobData.size);
            const arrayBuffer = await blobData.arrayBuffer();
            const fileExtension = fileName.split(".").pop()?.toLowerCase();
            console.log("Processing file with extension:", fileExtension);

            let result;
            switch (fileExtension) {
                case "kml":
                    result = await processKML(arrayBuffer, fileName); // Pass fileName for context
                    break;
                case "zip":
                    result = await processZIP(arrayBuffer); // processZIP handles internal file names
                    break;
                case "xml":
                    const decoder = new TextDecoder("utf-8");
                    const xmlContent = decoder.decode(new Uint8Array(arrayBuffer));
                    result = await processISOXML(xmlContent, fileName); // Pass fileName for context
                    break;
                default:
                    result = createErrorResponse(`Invalid file type: .${fileExtension}. Please upload a KML, ZIP, or XML (ISOXML) file.`);
                    break;
            }

            if (result.status === "error") {
                return result; // Already a structured error
            }

            return {
                message: result.message,
                paddocks: result.paddocks || [],
                geojson: result.geojson,
                status: "success"
            };

        } catch (error: any) {
            console.error("Critical error in processFile:", error);
            return {
                status: "error",
                message: error.message || "An unexpected error occurred while processing the file.",
                error: true // Keep for compatibility if frontend expects this
            };
        }
    }
};