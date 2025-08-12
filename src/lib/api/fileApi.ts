// src/lib/api/fileApi.ts
import { supabase } from '$lib/supabaseClient';
import type { Paddock, FileUpload } from '$lib/types'; // Update your imports as needed

export const fileApi = {
    async uploadFields(map_id: string, fields: Paddock[]) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const insertedFields = [];
            const rejectedFields = [];

            // Validate inputs
            if (!map_id || !Array.isArray(fields) || fields.length === 0) {
                throw new Error("Invalid data format");
            }

            // Process each field
            for (const field of fields) {
                if (field.status !== "accepted") {
                    rejectedFields.push({ name: field.name, reason: "Not accepted" });
                    continue;
                }

                const fieldToInsert = {
                    map_id: map_id,
                    name: field.name,
                    area: field.area,
                    boundary: field.boundary,
                    properties: field.properties,
                    polygon_areas: field.polygon_areas || null, // Add polygon_areas if it exists
                };

                try {
                    const { data, error } = await supabase
                        .from("fields")
                        .insert([fieldToInsert])
                        .select("*");

                    if (error) {
                        if (error.code === "23505") {
                            // Unique constraint violation
                            rejectedFields.push({
                                name: field.name,
                                reason: "Duplicate field name",
                            });
                        } else {
                            rejectedFields.push({ name: field.name, reason: error.message });
                        }
                    } else if (data && data.length > 0) {
                        insertedFields.push(data[0]);
                    }
                } catch (error) {
                    rejectedFields.push({ name: field.name, reason: "Unexpected error" });
                }
            }

            // Handle case where all fields were rejected
            if (insertedFields.length === 0 && rejectedFields.length > 0) {
                let errorMessage = "";
                if (rejectedFields.length === 1) {
                    errorMessage = `Paddock "${rejectedFields[0].name}" was rejected: ${rejectedFields[0].reason}`;
                } else {
                    const reasons = [...new Set(rejectedFields.map((f) => f.reason))];
                    errorMessage = `All ${rejectedFields.length} paddocks were rejected. Reasons: ${reasons.join(", ")}`;
                }
                throw new Error(errorMessage);
            }

            return {
                success: true,
                insertedFields,
                rejectedFields,
            };
        } catch (error) {
            console.error("Error uploading fields:", error);
            return {
                success: false,
                message: error.message,
                insertedFields: [],
                rejectedFields: []
            };
        }
    },

    // Download file function
    async downloadFile(fileName: string): Promise<{
        success: boolean;
        data?: Blob;
        message?: string;
    }> {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;
            // Construct the full path including the user-specific folder
            const filePath = `user_${userId}/${fileName}`;

            const { data, error } = await supabase.storage
                .from("user_files_bucket")
                .download(filePath);

            if (error) {
                throw new Error(`Failed to download file: ${error.message}`);
            }

            if (!data) {
                throw new Error("File not found");
            }

            return {
                success: true,
                data: data // This is the blob
            };
        } catch (error) {
            console.error("Error downloading file:", error);
            return {
                success: false,
                message: error.message
            };
        }
    },

    // Delete file function
    async deleteFile(fileName: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;
            const filePath = `user_${userId}/${fileName}`;

            // Check if the file exists
            const { data: fileData, error: fileError } = await supabase.storage
                .from("user_files_bucket")
                .list(`user_${userId}`, {
                    limit: 1,
                    offset: 0,
                    search: fileName,
                });

            if (fileError) throw fileError;
            if (!fileData || fileData.length === 0) {
                throw new Error("File not found in storage");
            }

            // Delete from storage bucket
            const { error: deleteError } = await supabase.storage
                .from("user_files_bucket")
                .remove([filePath]);

            if (deleteError) throw deleteError;

            // Delete the file metadata from the user_files table
            const { error: dbError } = await supabase
                .from("user_files")
                .delete()
                .match({ file_name: fileName, user_id: userId });

            if (dbError) throw dbError;

            return {
                success: true,
                message: "File deleted successfully"
            };
        } catch (error) {
            console.error("Error deleting file:", error);
            return {
                success: false,
                message: error.message || "Error deleting file. If this persists please contact us."
            };
        }
    },

    // Update field function
    async updateField(fieldId: string, name: string, area?: number, polygonAreas?: { individual_areas: number[], total_area: number }) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            // First, check if the field belongs to the user's master map
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("master_map_id")
                .eq("id", userId)
                .single();

            if (profileError) {
                throw new Error(`Profile error: ${profileError.message}`);
            }

            const masterMapId = profileData.master_map_id;
            if (!masterMapId) {
                throw new Error("No master map associated with user");
            }

            // Prepare update data with conditional fields
            const updateData: Record<string, any> = { name };

            // If polygon areas are provided, use their cumulative total as the area
            if (polygonAreas && polygonAreas.individual_areas && polygonAreas.individual_areas.length > 0) {
                const calculatedTotalArea = polygonAreas.individual_areas.reduce((sum, area) => sum + area, 0);
                updateData['area'] = calculatedTotalArea;
                updateData['polygon_areas'] = polygonAreas;
            } else if (area !== undefined) {
                // Fallback to provided area if no polygon areas
                updateData['area'] = area;
            }

            // Update the field
            const { data: updatedData, error: updateError } = await supabase
                .from("fields")
                .update(updateData)
                .eq("field_id", fieldId)
                .eq("map_id", masterMapId)
                .select();

            if (updateError) {
                throw new Error(`Update error: ${updateError.message}`);
            }

            return {
                success: true,
                message: "Field updated successfully",
                data: updatedData
            };
        } catch (error) {
            console.error("Error updating field:", error);
            return {
                success: false,
                message: error.message || "An error occurred while updating the field"
            };
        }
    },

    // Delete field function
    async deleteField(fieldId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            // First, check if the field belongs to the user's master map
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("master_map_id")
                .eq("id", userId)
                .single();

            if (profileError) {
                throw new Error(`Profile error: ${profileError.message}`);
            }

            const masterMapId = profileData.master_map_id;
            if (!masterMapId) {
                throw new Error("No master map associated with user");
            }

            // Delete the field
            const { error: deleteError } = await supabase
                .from("fields")
                .delete()
                .eq("field_id", fieldId)
                .eq("map_id", masterMapId);

            if (deleteError) {
                throw new Error(`Delete error: ${deleteError.message}`);
            }

            return {
                success: true,
                message: "Field deleted successfully"
            };
        } catch (error) {
            console.error("Error deleting field:", error);
            return {
                success: false,
                message: error.message || "An error occurred while deleting the field"
            };
        }
    },

    // Upload file function
    async uploadFile(file: File) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            if (!file) {
                throw new Error("No file selected");
            }

            // Upload to main bucket
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from("user_files_bucket")
                .upload(`user_${userId}/${file.name}`, file);

            if (uploadError) throw uploadError;

            // Try to upload to copy bucket, but log errors instead of failing
            try {
                console.log("Attempting to upload to backup bucket...");
                const { data: copyData, error: copyError } = await supabase.storage
                    .from("user_files_bucket_copy")
                    .upload(`user_${userId}/${file.name}`, file);

                if (copyError) {
                    console.error("Backup upload error:", copyError);
                    console.log("Main upload succeeded, but backup failed. Check bucket permissions.");
                } else {
                    console.log("Backup upload succeeded:", copyData);
                }
            } catch (backupError) {
                console.error("Exception during backup upload:", backupError);
                console.log("Continuing with main workflow despite backup failure");
            }

            // Insert metadata and return the full row
            const { data: insertData, error: insertError } = await supabase
                .from("user_files")
                .insert({
                    file_name: file.name,
                    file_path: uploadData.path,
                    user_id: userId,
                })
                .select("*")
                .single();

            if (insertError) throw insertError;

            return {
                success: true,
                message: "File uploaded successfully",
                file: insertData
            };
        } catch (error) {
            console.error("Error uploading file:", error);
            return {
                success: false,
                message: error.message || "Failed to upload file"
            };
        }
    },


    // Get user files (replacing /api/files)
    async getUserFiles() {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            const { data, error } = await supabase
                .from("user_files")
                .select(`file_id, user_id, file_name, file_path, created_at`)
                .eq("user_id", userId)
                .order("created_at", { ascending: false });

            if (error) {
                throw error;
            }

            const files = data.map((file) => ({
                id: file.file_id,
                name: file.file_name,
                path: file.file_path,
                uploadedDate: file.created_at,
                status: "Processed",
                message: "File uploaded successfully",
            }));

            return files;
        } catch (error) {
            console.error("Error fetching user files:", error);
            throw new Error("Failed to fetch user files");
        }
    },

    // Load fields (replacing /api/files/load_fields)
    async loadFields() {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            // Get user's master map ID
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("master_map_id")
                .eq("id", userId)
                .single();

            if (profileError) {
                throw profileError;
            }

            const masterMapId = profileData.master_map_id;
            if (!masterMapId) {
                throw new Error("No master map associated with user");
            }

            // Get fields for master map
            const { data: fieldsData, error: fieldsError } = await supabase
                .from("fields")
                .select(`*`)
                .eq("map_id", masterMapId)
                .order("name", { ascending: true });

            if (fieldsError) {
                throw fieldsError;
            }

            return { fields: fieldsData };
        } catch (error) {
            console.error("Error loading fields:", error);
            return { fields: [], error: error.message };
        }
    }

};