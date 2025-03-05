// src/lib/api/operationApi.ts
import { supabase } from '$lib/supabaseClient';

export const operationApi = {
    // Update the selected operation for a user's profile
    async updateSelectedOperation(profileId: string, operationId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Verify that the profile ID matches the current user
            if (session.session.user.id !== profileId) {
                throw new Error("Unauthorized");
            }

            const { data, error } = await supabase
                .from("profiles")
                .update({ selected_operation_id: operationId })
                .eq("id", profileId)
                .select("*")
                .single();

            if (error) {
                throw new Error(`Failed to update selected operation: ${error.message}`);
            }

            if (!data) {
                throw new Error("Profile not found");
            }

            return {
                success: true,
                message: "Successfully updated selected operation",
                profile: data
            };
        } catch (error) {
            console.error("Error updating selected operation:", error);
            return {
                success: false,
                message: error.message
            };
        }
    },

    // Add a new operation to a map
    async addOperation(master_map_id: string, name: string, year: number, description: string = "") {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const newOperation = {
                master_map_id,
                name,
                year,
                description,
                created_at: new Date().toISOString(),
            };

            const { data, error } = await supabase
                .from("operations")
                .insert([newOperation])
                .select("*");

            if (error) {
                throw new Error(`Failed to add operation: ${error.message}`);
            }

            return {
                success: true,
                message: "Operation added successfully",
                operation: data[0]
            };
        } catch (error) {
            console.error("Error adding operation:", error);
            return {
                success: false,
                message: error.message
            };
        }
    },

    async updateOperation(operationId: string, operationData: {
        name: string;
        year: number;
        description?: string;
    }) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const { data, error } = await supabase
                .from("operations")
                .update(operationData)
                .eq("id", operationId)
                .select("*")
                .single();

            if (error) {
                throw new Error(`Failed to update operation: ${error.message}`);
            }

            return {
                success: true,
                message: "Operation updated successfully",
                operation: data
            };
        } catch (error) {
            console.error("Error updating operation:", error);
            return {
                success: false,
                message: error.message
            };
        }
    },

    // Delete an operation
    async deleteOperation(operationId: string) {
        try {
            const { data: session } = await supabase.auth.getSession();
            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            // Delete the operation
            const { error } = await supabase
                .from("operations")
                .delete()
                .eq("id", operationId);

            if (error) {
                throw new Error(`Failed to delete operation: ${error.message}`);
            }

            return {
                success: true,
                message: "Operation deleted successfully"
            };
        } catch (error) {
            console.error("Error deleting operation:", error);
            return {
                success: false,
                message: error.message
            };
        }
    }
};