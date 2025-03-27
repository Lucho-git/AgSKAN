// src/lib/api/processBoundariesApi.ts
import { supabase } from '$lib/supabaseClient';
// Remove direct JSZip import
// import JSZip from 'jszip';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';

// Define our utility functions directly in this file
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

// Helper functions outside the API object to avoid "this" context issues
async function processKML(fileData) {
    try {
        console.log("Processing KML file...");
        const decoder = new TextDecoder("utf-8");
        const kmlContent = decoder.decode(new Uint8Array(fileData));

        const kmlDoc = new DOMParser().parseFromString(kmlContent, "text/xml");
        const geojson = kml(kmlDoc);

        const paddockList = geojson.features
            .map((feature, index) => {
                const properties = feature.properties;
                const paddockName = findPaddockName(properties) || `ImportPaddock${index + 1}`;

                return {
                    name: paddockName,
                    properties: properties,
                    boundary: feature.geometry,
                };
            })
            .filter((paddock) => paddock.boundary !== null);

        if (paddockList.length === 0) {
            return {
                status: "error",
                message: "No valid paddocks found with boundary data in KML file.",
            };
        }

        return {
            status: "success",
            message: `Found ${paddockList.length} valid paddock${paddockList.length !== 1 ? "s" : ""} in KML file.`,
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
    } catch (error) {
        console.error("KML processing error:", error);
        return { status: "error", message: "Error processing the KML file." };
    }
}

async function processShapefile(shpData, dbfData) {
    try {
        console.log("Processing shapefile with shpjs...");
        const paddockList = [];

        // Use shpjs to parse the shapefile data
        let geojson;

        // If we have both shp and dbf data
        if (shpData && dbfData) {
            console.log("Processing with both SHP and DBF data");
            // Create a combined object for shpjs
            const combined = {
                shp: shpData,
                dbf: dbfData
            };
            geojson = await shp(combined);
        } else if (shpData) {
            // Fall back to just SHP if needed
            console.log("Processing with SHP data only");
            geojson = await shp(shpData);
        } else {
            throw new Error("Invalid shapefile data");
        }

        console.log("Shapefile parsed to GeoJSON:", geojson);

        // Check if we got a FeatureCollection or a single Feature
        const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];

        // Process each feature
        features.forEach((feature, index) => {
            if (feature.geometry) {
                const properties = feature.properties || {};
                const paddockName = findPaddockName(properties) || `ImportPaddock${index + 1}`;

                paddockList.push({
                    name: paddockName,
                    properties: properties,
                    boundary: feature.geometry,
                });
            }
        });

        if (paddockList.length === 0) {
            return {
                status: "error",
                message: "No valid paddocks found with boundary data in shapefile.",
            };
        }

        return {
            status: "success",
            message: `Found ${paddockList.length} valid paddock${paddockList.length !== 1 ? "s" : ""} in shapefile.`,
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
    } catch (error) {
        console.error("Shapefile processing error:", error);
        return { status: "error", message: `Error processing the shapefile: ${error.message}` };
    }
}

async function processZIP(fileData) {
    try {
        console.log("Processing ZIP file...");

        // Load JSZip dynamically
        const JSZip = await getJSZip();
        const zip = new JSZip();
        const contents = await zip.loadAsync(fileData);
        console.log("ZIP loaded, files:", Object.keys(contents.files));
        const files = Object.keys(contents.files);

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

        if (shapefileGroups.length > 0) {
            console.log(`Found ${shapefileGroups.length} shapefile groups`);

            // Process each shapefile group
            const allPaddocks = [];
            const allFeatures = [];

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
                        // For each paddock in this group, set or override the name based on the group name
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
                        allFeatures.push(...paddocksWithGroupName.map(paddock => ({
                            type: "Feature",
                            properties: {
                                ...paddock.properties,
                                name: paddock.name,
                            },
                            geometry: paddock.boundary,
                        })));
                    }
                }
            }

            if (allPaddocks.length > 0) {
                return {
                    status: "success",
                    message: `Found ${allPaddocks.length} valid paddocks from ${shapefileGroups.length} shapefiles.`,
                    paddocks: allPaddocks,
                    geojson: {
                        type: "FeatureCollection",
                        features: allFeatures,
                    },
                };
            }
        }

        // Fall back to previous behavior if no shapefile groups are found
        // Try to use shpjs directly on the zip data first (it can handle zipped shapefiles)
        try {
            console.log("Attempting to use shpjs directly on ZIP...");
            const geojson = await shp(fileData);
            console.log("SHP.js successfully processed the ZIP");

            // Process the GeoJSON
            const paddockList = [];
            const features = geojson.type === "FeatureCollection" ? geojson.features : [geojson];

            features.forEach((feature, index) => {
                if (feature.geometry) {
                    const properties = feature.properties || {};
                    const paddockName = findPaddockName(properties) || `ImportPaddock${index + 1}`;

                    paddockList.push({
                        name: paddockName,
                        properties: properties,
                        boundary: feature.geometry,
                    });
                }
            });

            if (paddockList.length > 0) {
                return {
                    status: "success",
                    message: `Found ${paddockList.length} valid paddock${paddockList.length !== 1 ? "s" : ""} in shapefile.`,
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
        } catch (err) {
            console.log("Direct shpjs processing failed, falling back to manual extraction:", err);
            // Continue with checking for individual files
        }

        // Check for individual shapefile components
        const shpFileName = files.find((file) => file.toLowerCase().endsWith(".shp"));
        const dbfFileName = files.find((file) => file.toLowerCase().endsWith(".dbf"));

        if (shpFileName) {
            console.log("Found individual shapefile components");
            const shpFile = await contents.file(shpFileName).async("arraybuffer");
            const dbfFile = dbfFileName ? await contents.file(dbfFileName).async("arraybuffer") : null;

            return processShapefile(shpFile, dbfFile);
        }

        // Check for KML file inside ZIP
        const kmlFileName = files.find((file) => file.toLowerCase().endsWith(".kml"));
        if (kmlFileName) {
            console.log("Found KML file in ZIP");
            const kmlFileContent = await contents.file(kmlFileName).async("arraybuffer");
            return processKML(kmlFileContent);
        }

        // Check for XML file (assuming it's ISOXML)
        const xmlFileName = files.find((file) => file.toLowerCase().endsWith(".xml"));
        if (xmlFileName) {
            console.log("Found XML file in ZIP");
            const xmlContent = await contents.file(xmlFileName).async("text");
            return processISOXML(xmlContent);
        }

        console.log("No valid files found in ZIP");
        return {
            status: "error",
            message: "No valid data files found in the zip archive.",
        };
    } catch (error) {
        console.error("ZIP processing error:", error);
        return { status: "error", message: `Error processing the zip file: ${error.message}` };
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
            return { status: "error", message: "Not a valid ISOXML file." };
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
                    ringCoordinates.push(ringCoordinates[0]);

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
            return {
                status: "error",
                message: "No valid paddocks found with boundary data in ISOXML file.",
            };
        }

        // Create a GeoJSON FeatureCollection
        const geojson = {
            type: "FeatureCollection",
            features: paddockList.map((paddock) => ({
                type: "Feature",
                properties: {
                    ...paddock.properties,
                    name: paddock.name,
                },
                geometry: paddock.boundary,
            })),
        };

        return {
            status: "success",
            message: `Found ${paddockList.length} valid paddock${paddockList.length !== 1 ? "s" : ""} in ISOXML file with a total of ${totalExclusions} exclusion${totalExclusions !== 1 ? "s" : ""}.`,
            paddocks: paddockList,
            geojson: geojson,
        };
    } catch (error) {
        console.error("ISOXML processing error:", error);
        return { status: "error", message: "Error processing the ISOXML file." };
    }
}

function findPaddockName(properties) {
    const possibleNameFields = [
        "name",
        "NAME",
        "Name",
        "PaddockName",
        "PADDOCK_NAME",
        "paddock_name",
        "PADDOCKNAME",
        "FIELD_NAME",
    ];
    for (const field of possibleNameFields) {
        if (properties[field]) {
            return properties[field];
        }
    }
    return null;
}

// The main API object
export const processBoundariesApi = {
    async processFile(fileName: string) {
        try {
            console.log("Starting processing of file:", fileName);
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            if (!fileName) {
                throw new Error("File name is required");
            }

            const filePath = `user_${userId}/${fileName}`;
            console.log("File path:", filePath);

            // Download the file using regular supabase client
            console.log("Downloading file from Supabase...");
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
            console.log("Converted to ArrayBuffer, size:", arrayBuffer.byteLength);

            // Process the file based on extension
            const fileExtension = fileName.split(".").pop().toLowerCase();
            console.log("File extension:", fileExtension);

            let result;
            if (fileExtension === "kml") {
                result = await processKML(arrayBuffer);
            } else if (fileExtension === "zip") {
                result = await processZIP(arrayBuffer);
            } else if (fileExtension === "xml") {
                const decoder = new TextDecoder("utf-8");
                const xmlContent = decoder.decode(new Uint8Array(arrayBuffer));
                result = processISOXML(xmlContent);
            } else {
                result = {
                    status: "error",
                    message: "Invalid file type. Please upload a zip, KML, or XML file.",
                };
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